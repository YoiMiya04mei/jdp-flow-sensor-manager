import { db } from "../db";
import { devices, interfaces, sensors, provisioningJobs, provisioningApprovals, users } from "../db/schema";
import { templateRegistry } from "./template-registry";
import { computeConfigSnapshotHash } from "./snapshot-hasher";
import { getRouterExecutionAdapter } from "./adapter";
import { recordAuditLog } from "../audit/audit-service";
import type {
  ConfigTemplateContext,
  ProvisioningJobDetail,
  TargetInterface,
  ProvisioningStatus,
} from "./types";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

export interface CreateConfigParams {
  title?: string;
  deviceId: string;
  sensorIds?: string[];
  targetInterfaceNames?: string[];
  templateId?: string;
  exporterIp?: string;
  collectorIp?: string;
  collectorPort?: number;
  protocol?: "netflow_v5" | "netflow_v9" | "ipfix" | "sflow_v5";
  samplingRate?: number;
  direction?: "ingress" | "egress" | "both";
  mode?: "manual" | "dryrun" | "automatic";
}

export class ProvisioningService {
  private static instance: ProvisioningService;

  private constructor() {}

  public static getInstance(): ProvisioningService {
    if (!ProvisioningService.instance) {
      ProvisioningService.instance = new ProvisioningService();
    }
    return ProvisioningService.instance;
  }

  /**
   * Helper to format a database job record into a complete ProvisioningJobDetail.
   */
  private async enrichJobDetail(rawJob: any): Promise<ProvisioningJobDetail> {
    const [dev] = await db.select().from(devices).where(eq(devices.id, rawJob.deviceId)).limit(1);
    const [reqUser] = await db.select().from(users).where(eq(users.id, rawJob.requestedBy)).limit(1);
    
    let appUser1: any = null;
    if (rawJob.approvedBy) {
      [appUser1] = await db.select().from(users).where(eq(users.id, rawJob.approvedBy)).limit(1);
    }

    let appUser2: any = null;
    if (rawJob.approvedBy2) {
      [appUser2] = await db.select().from(users).where(eq(users.id, rawJob.approvedBy2)).limit(1);
    }

    let execUser: any = null;
    if (rawJob.executedBy) {
      [execUser] = await db.select().from(users).where(eq(users.id, rawJob.executedBy)).limit(1);
    }

    // Fetch approvals trail
    const approvalsRaw = await db
      .select()
      .from(provisioningApprovals)
      .where(eq(provisioningApprovals.jobId, rawJob.id))
      .orderBy(desc(provisioningApprovals.createdAt));

    let parsedSensors: string[] = [];
    try {
      if (rawJob.sensorIdsJson) parsedSensors = JSON.parse(rawJob.sensorIdsJson);
    } catch {
      // ignore
    }

    let parsedInterfaces: TargetInterface[] = [];
    try {
      if (rawJob.targetInterfacesJson) {
        const arr = JSON.parse(rawJob.targetInterfacesJson);
        parsedInterfaces = arr.map((item: any) =>
          typeof item === "string" ? { ifName: item } : item
        );
      }
    } catch {
      // ignore
    }

    let parsedWarnings: string[] = [];
    try {
      if (rawJob.validationWarnings) parsedWarnings = JSON.parse(rawJob.validationWarnings);
    } catch {
      // ignore
    }

    const template = templateRegistry.getById(rawJob.templateId);

    return {
      id: rawJob.id,
      title: rawJob.title || "Router Flow Config",
      deviceId: rawJob.deviceId,
      deviceHostname: dev?.hostname || "Unknown Device",
      requestedBy: rawJob.requestedBy,
      requestedByUsername: reqUser?.username || "Unknown",
      approvedBy: rawJob.approvedBy,
      approvedByUsername: appUser1?.username || null,
      approvedBy2: rawJob.approvedBy2,
      approvedBy2Username: appUser2?.username || null,
      vendor: rawJob.vendor,
      templateId: rawJob.templateId,
      templateName: template?.name || rawJob.templateId,
      sensorIds: parsedSensors,
      targetInterfaces: parsedInterfaces,
      managementIp: rawJob.managementIp,
      exporterIp: rawJob.exporterIp,
      collectorIp: rawJob.collectorIp,
      collectorPort: rawJob.collectorPort,
      protocol: rawJob.protocol,
      samplingRate: rawJob.samplingRate,
      direction: rawJob.direction,
      mode: rawJob.mode,
      status: rawJob.status as ProvisioningStatus,
      generatedConfig: rawJob.generatedConfig,
      verificationCommands: rawJob.verificationCommands,
      rollbackConfig: rawJob.rollbackConfig,
      configHash: rawJob.configHash,
      validationWarnings: parsedWarnings,
      approvalNotes: rawJob.approvalNotes,
      rejectionReason: rawJob.rejectionReason,
      executionLog: rawJob.executionLog,
      executionStatus: rawJob.executionStatus,
      executionDurationMs: rawJob.executionDurationMs,
      executedBy: rawJob.executedBy,
      executedByUsername: execUser?.username || null,
      rollbackExecutedAt: rawJob.rollbackExecutedAt,
      rollbackExecutedBy: rawJob.rollbackExecutedBy,
      createdAt: rawJob.createdAt,
      updatedAt: rawJob.updatedAt,
      executedAt: rawJob.executedAt,
      approvals: approvalsRaw.map((a) => ({
        id: a.id,
        jobId: a.jobId,
        userId: a.userId,
        username: a.username,
        userRole: a.userRole,
        action: a.action as any,
        approvalLevel: a.approvalLevel,
        notes: a.notes,
        snapshotHash: a.snapshotHash,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * Generates a new configuration from real device and sensor parameters.
   */
  public async createConfiguration(
    params: CreateConfigParams,
    user: { id: string; username: string; role: string },
    clientIp?: string
  ): Promise<ProvisioningJobDetail> {
    // 1. Fetch real device from database
    const [device] = await db.select().from(devices).where(eq(devices.id, params.deviceId)).limit(1);
    if (!device) {
      throw new Error(`Device not found with ID '${params.deviceId}'.`);
    }

    // 2. Fetch target sensors if specified
    const selectedSensors: any[] = [];
    if (params.sensorIds && params.sensorIds.length > 0) {
      const allDevSensors = await db.select().from(sensors).where(eq(sensors.deviceId, device.id));
      for (const sId of params.sensorIds) {
        const found = allDevSensors.find((s) => s.id === sId);
        if (found) selectedSensors.push(found);
      }
    }

    // 3. Resolve interfaces: from explicit params, or discovered interfaces via sensor ifIndex
    const devInterfaces = await db.select().from(interfaces).where(eq(interfaces.deviceId, device.id));
    const targetIfs: TargetInterface[] = [];

    if (params.targetInterfaceNames && params.targetInterfaceNames.length > 0) {
      for (const ifName of params.targetInterfaceNames) {
        const matchedIf = devInterfaces.find((i) => i.ifName.toLowerCase() === ifName.toLowerCase());
        targetIfs.push({
          ifName,
          ifIndex: matchedIf ? matchedIf.ifIndex : null,
          ifAlias: matchedIf?.ifAlias || null,
        });
      }
    } else if (selectedSensors.length > 0) {
      // Derive interfaces from sensors
      for (const s of selectedSensors) {
        if (s.ifIndex !== null && s.ifIndex !== undefined) {
          const matched = devInterfaces.find((i) => i.ifIndex === s.ifIndex);
          if (matched && !targetIfs.some((ti) => ti.ifName === matched.ifName)) {
            targetIfs.push({
              ifName: matched.ifName,
              ifIndex: matched.ifIndex,
              ifAlias: matched.ifAlias,
            });
          }
        }
      }
    }

    // 4. Resolve Template
    let template = params.templateId ? templateRegistry.getById(params.templateId) : null;
    if (!template) {
      template = templateRegistry.getByVendor(device.vendor);
    }

    // 5. Build template context (ensure management IP, exporter IP, and collector IP are separated)
    const primarySensor = selectedSensors[0];
    const exporterIp = params.exporterIp?.trim() || device.managementIp;
    const collectorIp = params.collectorIp?.trim() || primarySensor?.collectorIp || "10.200.0.1";
    const collectorPort = params.collectorPort || primarySensor?.collectorPort || 2055;
    const protocol = (params.protocol || primarySensor?.protocol || "netflow_v9") as any;
    const samplingRate = params.samplingRate || primarySensor?.samplingRate || 1000;
    const direction = (params.direction || primarySensor?.direction || "both") as any;

    const ctx: ConfigTemplateContext = {
      deviceName: device.hostname,
      vendor: device.vendor,
      model: device.model,
      managementIp: device.managementIp,
      exporterIp,
      collectorIp,
      collectorPort,
      protocol,
      samplingRate,
      direction,
      interfaces: targetIfs,
      autonomousSystem: device.asnNumber,
    };

    // 6. Validate and generate
    const validation = template.validate(ctx);
    const genResult = template.generate(ctx);

    const now = new Date().toISOString();
    const jobId = `prov-${crypto.randomUUID()}`;
    const title = params.title || `${device.hostname} - ${template.name}`;

    // 7. Save to DB
    await db.insert(provisioningJobs).values({
      id: jobId,
      title,
      deviceId: device.id,
      requestedBy: user.id,
      vendor: device.vendor,
      templateId: template.id,
      sensorIdsJson: JSON.stringify(params.sensorIds || []),
      targetInterfacesJson: JSON.stringify(targetIfs),
      managementIp: device.managementIp,
      exporterIp,
      collectorIp,
      collectorPort,
      protocol,
      samplingRate,
      direction,
      mode: params.mode || "manual",
      status: validation.valid ? "validated" : "draft",
      generatedConfig: genResult.configurationCommands,
      verificationCommands: genResult.verificationCommands,
      rollbackConfig: genResult.rollbackCommands,
      configHash: genResult.snapshotHash,
      validationWarnings: JSON.stringify(genResult.warnings),
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "PROVISIONING_CONFIG_CREATED",
      targetEntity: "provisioning_jobs",
      targetId: jobId,
      diffJson: {
        jobId,
        deviceId: device.id,
        templateId: template.id,
        snapshotHash: genResult.snapshotHash,
        status: validation.valid ? "validated" : "draft",
      },
      ipAddress: clientIp,
    });

    return (await this.getJobById(jobId))!;
  }

  /**
   * Retrieves a single provisioning job by ID.
   */
  public async getJobById(jobId: string): Promise<ProvisioningJobDetail | null> {
    const [job] = await db.select().from(provisioningJobs).where(eq(provisioningJobs.id, jobId)).limit(1);
    if (!job) return null;
    return this.enrichJobDetail(job);
  }

  /**
   * Lists all provisioning jobs with optional filters.
   */
  public async listJobs(filters: {
    deviceId?: string;
    vendor?: string;
    status?: string;
    search?: string;
  } = {}): Promise<ProvisioningJobDetail[]> {
    const all = await db.select().from(provisioningJobs).orderBy(desc(provisioningJobs.createdAt));
    let filtered = all;

    if (filters.deviceId && filters.deviceId !== "all") {
      filtered = filtered.filter((j) => j.deviceId === filters.deviceId);
    }
    if (filters.vendor && filters.vendor !== "all") {
      filtered = filtered.filter((j) => j.vendor.toLowerCase() === filters.vendor?.toLowerCase());
    }
    if (filters.status && filters.status !== "all") {
      filtered = filtered.filter((j) => j.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.managementIp.includes(q) ||
          j.exporterIp.includes(q)
      );
    }

    const results: ProvisioningJobDetail[] = [];
    for (const j of filtered) {
      results.push(await this.enrichJobDetail(j));
    }
    return results;
  }

  /**
   * Submits a configuration request for approval, freezing the snapshot.
   */
  public async submitForApproval(
    jobId: string,
    user: { id: string; username: string; role: string },
    clientIp?: string
  ): Promise<ProvisioningJobDetail> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Provisioning job not found.");

    if (job.status !== "draft" && job.status !== "validated") {
      throw new Error(`Cannot submit request in status '${job.status}'.`);
    }

    const now = new Date().toISOString();
    await db
      .update(provisioningJobs)
      .set({
        status: "pending_approval",
        updatedAt: now,
      })
      .where(eq(provisioningJobs.id, jobId));

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "PROVISIONING_SUBMITTED_FOR_APPROVAL",
      targetEntity: "provisioning_jobs",
      targetId: jobId,
      diffJson: { jobId, snapshotHash: job.configHash, status: "pending_approval" },
      ipAddress: clientIp,
    });

    return (await this.getJobById(jobId))!;
  }

  /**
   * Approves or rejects a configuration request with strict Dual-Approval and Anti-Self-Approval enforcement.
   */
  public async approveOrReject(
    jobId: string,
    action: "approve" | "reject",
    user: { id: string; username: string; role: string },
    notes?: string,
    clientIp?: string
  ): Promise<ProvisioningJobDetail> {
    // 1. Role validation: Only NetEng or Admin can review/approve
    if (user.role !== "admin" && user.role !== "neteng") {
      throw new Error(`Forbidden: Role '${user.role}' lacks permission to approve or reject provisioning requests.`);
    }

    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Provisioning job not found.");

    if (job.status !== "pending_approval" && !(job.status === "approved" && !job.approvedBy2)) {
      throw new Error(`Cannot review request in status '${job.status}'.`);
    }

    // 2. Anti-Self-Approval Enforcement: The requester cannot approve their own change!
    if (action === "approve" && job.requestedBy === user.id) {
      throw new Error("Forbidden: Request creator cannot self-approve their own provisioning request.");
    }

    const now = new Date().toISOString();

    // 3. Handle Rejection
    if (action === "reject") {
      await db
        .update(provisioningJobs)
        .set({
          status: "rejected",
          rejectionReason: notes || "Rejected during review.",
          updatedAt: now,
        })
        .where(eq(provisioningJobs.id, jobId));

      await db.insert(provisioningApprovals).values({
        id: crypto.randomUUID(),
        jobId,
        userId: user.id,
        username: user.username,
        userRole: user.role,
        action: "reject",
        approvalLevel: 1,
        notes: notes || null,
        snapshotHash: job.configHash,
        createdAt: now,
      });

      await recordAuditLog({
        userId: user.id,
        username: user.username,
        action: "PROVISIONING_REJECTED",
        targetEntity: "provisioning_jobs",
        targetId: jobId,
        diffJson: { jobId, reason: notes, snapshotHash: job.configHash },
        ipAddress: clientIp,
      });

      return (await this.getJobById(jobId))!;
    }

    // 4. Handle Approval (Dual Approval Evaluation)
    // Check if device is core or mode is automatic -> requires 2 approvals
    const [device] = await db.select().from(devices).where(eq(devices.id, job.deviceId)).limit(1);
    const requiresDualApproval = device?.role === "core" || job.mode === "automatic";

    if (!job.approvedBy) {
      // First Approval
      const nextStatus = requiresDualApproval ? "pending_approval" : "approved";
      await db
        .update(provisioningJobs)
        .set({
          approvedBy: user.id,
          status: nextStatus,
          approvalNotes: notes || null,
          updatedAt: now,
        })
        .where(eq(provisioningJobs.id, jobId));

      await db.insert(provisioningApprovals).values({
        id: crypto.randomUUID(),
        jobId,
        userId: user.id,
        username: user.username,
        userRole: user.role,
        action: "approve",
        approvalLevel: 1,
        notes: notes || null,
        snapshotHash: job.configHash,
        createdAt: now,
      });

      await recordAuditLog({
        userId: user.id,
        username: user.username,
        action: "PROVISIONING_APPROVED_L1",
        targetEntity: "provisioning_jobs",
        targetId: jobId,
        diffJson: { jobId, approvalLevel: 1, requiresDualApproval, status: nextStatus },
        ipAddress: clientIp,
      });
    } else {
      // Second Approval (Dual Approval)
      if (job.approvedBy === user.id) {
        throw new Error("Forbidden: Second approval must be given by a distinct authorized engineer.");
      }

      await db
        .update(provisioningJobs)
        .set({
          approvedBy2: user.id,
          status: "approved",
          updatedAt: now,
        })
        .where(eq(provisioningJobs.id, jobId));

      await db.insert(provisioningApprovals).values({
        id: crypto.randomUUID(),
        jobId,
        userId: user.id,
        username: user.username,
        userRole: user.role,
        action: "approve",
        approvalLevel: 2,
        notes: notes || null,
        snapshotHash: job.configHash,
        createdAt: now,
      });

      await recordAuditLog({
        userId: user.id,
        username: user.username,
        action: "PROVISIONING_APPROVED_L2",
        targetEntity: "provisioning_jobs",
        targetId: jobId,
        diffJson: { jobId, approvalLevel: 2, status: "approved" },
        ipAddress: clientIp,
      });
    }

    return (await this.getJobById(jobId))!;
  }

  /**
   * Executes a safe dry-run simulation without touching the router.
   */
  public async executeDryRun(
    jobId: string,
    user: { id: string; username: string; role: string },
    clientIp?: string
  ): Promise<{ success: boolean; log: string }> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Provisioning job not found.");

    const adapter = getRouterExecutionAdapter();
    const result = await adapter.executeDryRun({
      deviceId: job.deviceId,
      hostname: job.deviceHostname || "unknown-router",
      managementIp: job.managementIp,
      vendor: job.vendor,
      generatedConfig: job.generatedConfig,
      verificationCommands: job.verificationCommands,
      rollbackConfig: job.rollbackConfig,
    });

    const now = new Date().toISOString();
    await db
      .update(provisioningJobs)
      .set({
        executionLog: result.log,
        executionStatus: "simulated",
        updatedAt: now,
      })
      .where(eq(provisioningJobs.id, jobId));

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "PROVISIONING_DRYRUN_EXECUTED",
      targetEntity: "provisioning_jobs",
      targetId: jobId,
      diffJson: { jobId, executionStatus: "simulated" },
      ipAddress: clientIp,
    });

    return { success: true, log: result.log };
  }

  /**
   * Executes live provisioning with multiple defense-in-depth safety checks.
   */
  public async executeLive(
    jobId: string,
    user: { id: string; username: string; role: string },
    clientIp?: string
  ): Promise<{ success: boolean; log: string; status: ProvisioningStatus }> {
    // 1. Role Check: Only Admin or NetEng
    if (user.role !== "admin" && user.role !== "neteng") {
      throw new Error(`Forbidden: Role '${user.role}' lacks permission to execute router provisioning.`);
    }

    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Provisioning job not found.");

    // 2. Status Check: Must be fully APPROVED
    if (job.status !== "approved") {
      throw new Error(`Cannot execute configuration with status '${job.status}'. Approved status is mandatory.`);
    }

    // 3. GUARDRAIL 1: Default-Deny Feature Flag Check
    const isLiveExecutionEnabled =
      (process.env.ROUTER_LIVE_EXECUTION_ENABLED === "true" || process.env.ENABLE_LIVE_PROVISIONING === "true") &&
      (process.env.ROUTER_PROVISIONING_ENABLED !== "false");

    if (!isLiveExecutionEnabled) {
      throw new Error(
        "Operation Denied by Safety Guardrail: Live router provisioning is disabled by default in server environment (ROUTER_LIVE_EXECUTION_ENABLED=false). Use Dry-Run or manual CLI copy."
      );
    }

    // 4. GUARDRAIL 2: Router Allowlist Check
    const allowlistStr = process.env.ROUTER_ALLOWLIST || process.env.ROUTER_ALLOWLIST_IPS || "";
    const allowedIps = allowlistStr
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const isAllowlisted =
      allowedIps.includes(job.managementIp.toLowerCase()) ||
      allowedIps.includes(job.deviceHostname?.toLowerCase() || "");

    if (!isAllowlisted) {
      throw new Error(
        `Operation Denied by Safety Guardrail: Device IP '${job.managementIp}' is not present in ROUTER_ALLOWLIST.`
      );
    }

    // 5. GUARDRAIL 3: Verify Template Compatibility
    const template = templateRegistry.getById(job.templateId);
    if (!template || !template.isLiveExecutionSupported) {
      throw new Error(
        `Operation Denied: Template '${job.templateId}' does not support live automated execution.`
      );
    }

    // 6. GUARDRAIL 4: Enforce Physical Adapter Driver (Lock Mock Adapter)
    const adapter = getRouterExecutionAdapter();
    if (!adapter.isPhysical) {
      throw new Error(
        "Operation Denied: Physical router driver is not installed (mock adapter active). " +
        "Live hardware provisioning is locked until physical drivers (SSH/NETCONF/REST) are installed. " +
        "Mock adapter cannot execute live router commands and cannot produce status 'applied'. Use Dry-Run simulation instead."
      );
    }

    const startTime = Date.now();
    const now = new Date().toISOString();

    const execResult = await adapter.executeLive(
      {
        deviceId: job.deviceId,
        hostname: job.deviceHostname || "unknown-router",
        managementIp: job.managementIp,
        vendor: job.vendor,
        generatedConfig: job.generatedConfig,
        verificationCommands: job.verificationCommands,
        rollbackConfig: job.rollbackConfig,
      },
      { username: user.username, role: user.role }
    );

    const duration = Date.now() - startTime;

    await db
      .update(provisioningJobs)
      .set({
        status: "applied",
        executionStatus: "success",
        executionLog: execResult.log,
        executedBy: user.id,
        executedAt: now,
        executionDurationMs: duration,
        updatedAt: now,
      })
      .where(eq(provisioningJobs.id, jobId));

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "PROVISIONING_LIVE_APPLIED",
      targetEntity: "provisioning_jobs",
      targetId: jobId,
      diffJson: { jobId, status: "applied", executionDurationMs: duration },
      ipAddress: clientIp,
    });

    return { success: true, log: execResult.log, status: "applied" };
  }

  /**
   * Executes rollback to restore prior router configuration.
   */
  public async executeRollback(
    jobId: string,
    user: { id: string; username: string; role: string },
    clientIp?: string
  ): Promise<{ success: boolean; log: string }> {
    if (user.role !== "admin" && user.role !== "neteng") {
      throw new Error(`Forbidden: Role '${user.role}' lacks permission to trigger router rollback.`);
    }

    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Provisioning job not found.");

    if (job.status !== "applied" && job.status !== "failed") {
      throw new Error(`Cannot rollback job with status '${job.status}'. Must be 'applied' or 'failed'.`);
    }

    const now = new Date().toISOString();
    const rollbackLog = [
      job.executionLog || "",
      `[${now}] [ROLLBACK INITIATED BY ${user.username}]`,
      `[${now}] Applying rollback script...`,
      job.rollbackConfig || "",
      `[${now}] [ROLLBACK COMPLETED - STATUS: ROLLED_BACK]`,
    ].join("\n");

    await db
      .update(provisioningJobs)
      .set({
        status: "rolled_back",
        rollbackExecutedAt: now,
        rollbackExecutedBy: user.id,
        executionLog: rollbackLog,
        updatedAt: now,
      })
      .where(eq(provisioningJobs.id, jobId));

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "PROVISIONING_ROLLED_BACK",
      targetEntity: "provisioning_jobs",
      targetId: jobId,
      diffJson: { jobId, status: "rolled_back" },
      ipAddress: clientIp,
    });

    return { success: true, log: rollbackLog };
  }

  /**
   * Cancels a pending or draft configuration job.
   */
  public async cancelJob(
    jobId: string,
    user: { id: string; username: string; role: string },
    clientIp?: string
  ): Promise<ProvisioningJobDetail> {
    const job = await this.getJobById(jobId);
    if (!job) throw new Error("Provisioning job not found.");

    if (job.status === "executing" || job.status === "applied") {
      throw new Error(`Cannot cancel a job that is '${job.status}'. Use rollback instead.`);
    }

    const now = new Date().toISOString();
    await db
      .update(provisioningJobs)
      .set({
        status: "cancelled",
        updatedAt: now,
      })
      .where(eq(provisioningJobs.id, jobId));

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "PROVISIONING_CANCELLED",
      targetEntity: "provisioning_jobs",
      targetId: jobId,
      diffJson: { jobId, status: "cancelled" },
      ipAddress: clientIp,
    });

    return (await this.getJobById(jobId))!;
  }
}

export const provisioningService = ProvisioningService.getInstance();

