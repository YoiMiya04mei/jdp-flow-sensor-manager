import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { db } from "@/server/db";
import { devices, interfaces, sensors, users, provisioningJobs, provisioningApprovals } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { templateRegistry } from "@/server/provisioning/template-registry";
import { sanitizeCliIdentifier, sanitizeIpAddress, sanitizePortNumber, sanitizeSamplingRate } from "@/server/provisioning/sanitizer";
import { computeConfigSnapshotHash } from "@/server/provisioning/snapshot-hasher";
import { provisioningService } from "@/server/provisioning/provisioning-service";
import type { SessionUser } from "@/types";
import { eq, or } from "drizzle-orm";

describe("Phase 7: Router Config Generator & Controlled Provisioning", () => {
  const adminUser: SessionUser = {
    id: "usr-p7-admin",
    username: "p7_admin",
    email: "p7_admin@jdp-noc.internal",
    role: "admin",
  };

  const netengUser1: SessionUser = {
    id: "usr-p7-neteng1",
    username: "p7_neteng1",
    email: "p7_neteng1@jdp-noc.internal",
    role: "neteng",
  };

  const netengUser2: SessionUser = {
    id: "usr-p7-neteng2",
    username: "p7_neteng2",
    email: "p7_neteng2@jdp-noc.internal",
    role: "neteng",
  };

  const operatorUser: SessionUser = {
    id: "usr-p7-operator",
    username: "p7_operator",
    email: "p7_operator@jdp-noc.internal",
    role: "operator",
  };

  const analystUser: SessionUser = {
    id: "usr-p7-analyst",
    username: "p7_analyst",
    email: "p7_analyst@jdp-noc.internal",
    role: "analyst",
  };

  const testCoreDeviceId = `dev-p7-core-${Date.now()}`;
  const testEdgeDeviceId = `dev-p7-edge-${Date.now()}`;
  const testHuaweiDeviceId = `dev-p7-huawei-${Date.now()}`;
  const testCiscoDeviceId = `dev-p7-cisco-${Date.now()}`;
  const testUnsupportedDeviceId = `dev-p7-nokia-${Date.now()}`;

  beforeAll(async () => {
    await runMigrations();

    // Insert test users if neither ID nor email exists
    for (const u of [adminUser, netengUser1, netengUser2, operatorUser, analystUser]) {
      const [existing] = await db
        .select()
        .from(users)
        .where(or(eq(users.id, u.id), eq(users.email, u.email)));
      if (!existing) {
        await db.insert(users).values({
          id: u.id,
          username: u.username,
          email: u.email,
          passwordHash: "mock-hash",
          role: u.role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const now = new Date().toISOString();

    // Clean up any existing devices with these test IPs to ensure idempotent test runs
    const testIps = ["10.10.10.1", "10.20.20.1", "10.30.30.1", "10.40.40.1", "10.50.50.1"];
    for (const ip of testIps) {
      await db.delete(devices).where(eq(devices.managementIp, ip));
    }

    // 1. MikroTik Edge Router
    await db.insert(devices).values({
      id: testEdgeDeviceId,
      hostname: `edge-router-${Date.now()}.noc`,
      managementIp: "10.10.10.1",
      vendor: "mikrotik",
      model: "CCR2004",
      role: "edge",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 2. Juniper Core Router (requires Dual Approval)
    await db.insert(devices).values({
      id: testCoreDeviceId,
      hostname: `core-mx-${Date.now()}.noc`,
      managementIp: "10.20.20.1",
      vendor: "juniper",
      model: "MX204",
      role: "core",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 3. Huawei Router
    await db.insert(devices).values({
      id: testHuaweiDeviceId,
      hostname: `huawei-ne40-${Date.now()}.noc`,
      managementIp: "10.30.30.1",
      vendor: "huawei",
      model: "NE40E",
      role: "edge",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Cisco Router
    await db.insert(devices).values({
      id: testCiscoDeviceId,
      hostname: `cisco-asr-${Date.now()}.noc`,
      managementIp: "10.40.40.1",
      vendor: "cisco",
      model: "ASR1001-X",
      role: "edge",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 5. Unsupported Nokia Router
    await db.insert(devices).values({
      id: testUnsupportedDeviceId,
      hostname: `nokia-sr-${Date.now()}.noc`,
      managementIp: "10.50.50.1",
      vendor: "nokia",
      model: "7750-SR",
      role: "edge",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Insert sample interfaces
    await db.insert(interfaces).values([
      {
        id: `if-mikrotik-${Date.now()}`,
        deviceId: testEdgeDeviceId,
        ifIndex: 1,
        ifName: "sfp-sfpplus1",
        ifAlias: "Uplink Transit",
        ifSpeed: 10000000000,
        ifOperStatus: "up",
        lastDiscoveredAt: now,
      },
      {
        id: `if-juniper-${Date.now()}`,
        deviceId: testCoreDeviceId,
        ifIndex: 10,
        ifName: "et-0/0/0",
        ifAlias: "Core Backbone",
        ifSpeed: 100000000000,
        ifOperStatus: "up",
        lastDiscoveredAt: now,
      },
    ]);

    // Insert sample sensor on MikroTik
    await db.insert(sensors).values({
      id: `sns-mikrotik-${Date.now()}`,
      deviceId: testEdgeDeviceId,
      name: "MikroTik Edge NetFlow",
      protocol: "netflow_v9",
      collectorIp: "10.200.0.1",
      collectorPort: 2055,
      ifIndex: 1,
      samplingRate: 1000,
      direction: "both",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  });

  describe("Vendor Template Engine & Parameter Sanitizer", () => {
    it("prevents CLI command injection in parameter fields", () => {
      // Semicolon injection
      expect(sanitizeCliIdentifier("ether1; rm -rf /", "Interface").valid).toBe(false);
      // Newline injection
      expect(sanitizeCliIdentifier("ether1\nset user admin", "Interface").valid).toBe(false);
      // Backtick injection
      expect(sanitizeCliIdentifier("ether1`reboot`", "Interface").valid).toBe(false);
      // Pipe injection
      expect(sanitizeCliIdentifier("ether1 | sh", "Interface").valid).toBe(false);
      // Valid identifiers
      expect(sanitizeCliIdentifier("GigabitEthernet0/0/1", "Interface").valid).toBe(true);
      expect(sanitizeCliIdentifier("et-0/0/0.100", "Interface").valid).toBe(true);
      expect(sanitizeCliIdentifier("sfp-sfpplus1", "Interface").valid).toBe(true);
    });

    it("strictly validates IP addresses, ports, and sampling rates", () => {
      expect(sanitizeIpAddress("10.0.0.1; echo hack").valid).toBe(false);
      expect(sanitizeIpAddress("999.999.999.999").valid).toBe(false);
      expect(sanitizeIpAddress("192.168.1.1").valid).toBe(true);

      expect(sanitizePortNumber(0).valid).toBe(false);
      expect(sanitizePortNumber(70000).valid).toBe(false);
      expect(sanitizePortNumber(2055).valid).toBe(true);

      expect(sanitizeSamplingRate(0).valid).toBe(false);
      expect(sanitizeSamplingRate(-100).valid).toBe(false);
      expect(sanitizeSamplingRate(1000).valid).toBe(true);
    });

    it("selects correct golden templates for supported vendors and marks unsupported platforms", () => {
      const mt = templateRegistry.getByVendor("mikrotik");
      expect(mt.id).toBe("mikrotik_routeros_v7");
      expect(mt.compatibilityStatus).toBe("verified");
      expect(mt.isLiveExecutionSupported).toBe(true);

      const jun = templateRegistry.getByVendor("juniper");
      expect(jun.id).toBe("juniper_junos_inline_jflow");
      expect(jun.compatibilityStatus).toBe("verified");

      const hw = templateRegistry.getByVendor("huawei");
      expect(hw.id).toBe("huawei_vrp_netstream");
      expect(hw.compatibilityStatus).toBe("verified");

      const cs = templateRegistry.getByVendor("cisco");
      expect(cs.id).toBe("cisco_iosxe_fnf");
      expect(cs.compatibilityStatus).toBe("verified");

      // Unsupported vendor
      const nok = templateRegistry.getByVendor("nokia");
      expect(nok.compatibilityStatus).toBe("unsupported");
      expect(nok.isLiveExecutionSupported).toBe(false);
    });

    it("generates authentic CLI, verification, and rollback commands for MikroTik RouterOS", () => {
      const template = templateRegistry.getByVendor("mikrotik");
      const result = template.generate({
        deviceName: "router-mt-01",
        vendor: "mikrotik",
        managementIp: "10.0.0.1",
        exporterIp: "10.0.0.1",
        collectorIp: "10.200.0.1",
        collectorPort: 2055,
        protocol: "ipfix",
        samplingRate: 1000,
        direction: "both",
        interfaces: [{ ifName: "sfp-sfpplus1" }],
      });

      expect(result.configurationCommands).toContain("/ip traffic-flow set enabled=yes");
      expect(result.configurationCommands).toContain('dst-address=10.200.0.1 port=2055 version=ipfix');
      expect(result.verificationCommands).toContain("/ip traffic-flow print");
      expect(result.rollbackCommands).toContain('/ip traffic-flow target remove [find name="jdp-collector"]');
      expect(result.snapshotHash).toHaveLength(64);
    });

    it("generates authentic CLI, verification, and rollback commands for Juniper Junos", () => {
      const template = templateRegistry.getByVendor("juniper");
      const result = template.generate({
        deviceName: "core-mx-01",
        vendor: "juniper",
        managementIp: "10.0.0.2",
        exporterIp: "10.0.0.2",
        collectorIp: "10.200.0.1",
        collectorPort: 2055,
        protocol: "netflow_v9",
        samplingRate: 2000,
        direction: "both",
        interfaces: [{ ifName: "et-0/0/0" }],
      });

      expect(result.configurationCommands).toContain("set services flow-monitoring version9 template jdp-flow-v9");
      expect(result.configurationCommands).toContain("set forwarding-options sampling instance jdp-sampling-instance input rate 2000");
      expect(result.configurationCommands).toContain("set interfaces et-0/0/0 unit 0 family inet sampling input");
      expect(result.verificationCommands).toContain("show services accounting flow inline-jflow");
      expect(result.rollbackCommands).toContain("delete forwarding-options sampling instance jdp-sampling-instance");
      expect(result.snapshotHash).toHaveLength(64);
    });
  });

  describe("Snapshot Hasher & Immutability", () => {
    it("computes deterministic SHA-256 and detects parameter tampering", () => {
      const ctx1 = {
        deviceName: "edge-01",
        vendor: "mikrotik",
        managementIp: "10.0.0.1",
        exporterIp: "10.0.0.1",
        collectorIp: "10.200.0.1",
        collectorPort: 2055,
        protocol: "netflow_v9" as const,
        samplingRate: 1000,
        direction: "both" as const,
        interfaces: [{ ifName: "ether1" }],
      };

      const hash1 = computeConfigSnapshotHash("mikrotik_v7", ctx1, "cmd-original", "rb-original");
      const hash2 = computeConfigSnapshotHash("mikrotik_v7", ctx1, "cmd-original", "rb-original");
      expect(hash1).toBe(hash2);

      // Change collector port from 2055 to 2056
      const ctxTampered = { ...ctx1, collectorPort: 2056 };
      const hashTampered = computeConfigSnapshotHash("mikrotik_v7", ctxTampered, "cmd-original", "rb-original");
      expect(hashTampered).not.toBe(hash1);
    });
  });

  describe("Provisioning Workflow & Controlled Approval State Machine", () => {
    let edgeJobId: string;
    let coreJobId: string;

    it("generates a configuration job in 'validated' status from database records", async () => {
      const job = await provisioningService.createConfiguration(
        {
          deviceId: testEdgeDeviceId,
          title: "Edge Router NetFlow Provisioning",
          exporterIp: "10.10.10.1",
          collectorIp: "10.200.0.1",
          collectorPort: 2055,
          protocol: "netflow_v9",
          samplingRate: 1000,
          direction: "both",
          targetInterfaceNames: ["sfp-sfpplus1"],
        },
        operatorUser
      );

      expect(job).toBeDefined();
      expect(job.status).toBe("validated");
      expect(job.vendor).toBe("mikrotik");
      expect(job.configHash).toHaveLength(64);
      expect(job.requestedBy).toBe(operatorUser.id);
      edgeJobId = job.id;
    });

    it("submits the job for approval and freezes status to 'pending_approval'", async () => {
      const submitted = await provisioningService.submitForApproval(edgeJobId, operatorUser);
      expect(submitted.status).toBe("pending_approval");
    });

    it("STRICT SAFETY: rejects self-approval when requester tries to approve their own request", async () => {
      await expect(
        provisioningService.approveOrReject(edgeJobId, "approve", operatorUser)
      ).rejects.toThrow(/Role 'operator' lacks permission/);

      // Create a request by neteng1
      const netengJob = await provisioningService.createConfiguration(
        {
          deviceId: testEdgeDeviceId,
          title: "Neteng Self Job",
        },
        netengUser1
      );
      await provisioningService.submitForApproval(netengJob.id, netengUser1);

      // neteng1 tries to approve their own request -> MUST BE REJECTED
      await expect(
        provisioningService.approveOrReject(netengJob.id, "approve", netengUser1)
      ).rejects.toThrow(/Request creator cannot self-approve/);
    });

    it("allows authorized NetEng to approve request created by Operator", async () => {
      const approved = await provisioningService.approveOrReject(
        edgeJobId,
        "approve",
        netengUser1,
        "Approved for Edge maintenance window."
      );
      expect(approved.status).toBe("approved");
      expect(approved.approvedBy).toBe(netengUser1.id);
      expect(approved.approvals?.[0].snapshotHash).toBe(approved.configHash);
    });

    it("enforces DUAL APPROVAL on Core Routers before reaching 'approved' status", async () => {
      // Create request on Core Router (role: core)
      const coreJob = await provisioningService.createConfiguration(
        {
          deviceId: testCoreDeviceId,
          title: "Core Juniper Backbone Inline-Jflow",
          targetInterfaceNames: ["et-0/0/0"],
        },
        operatorUser
      );
      await provisioningService.submitForApproval(coreJob.id, operatorUser);
      coreJobId = coreJob.id;

      // 1st Approval by NetEng1
      const level1 = await provisioningService.approveOrReject(coreJobId, "approve", netengUser1, "L1 NetEng Review OK");
      // Core router requires 2 approvals, so remains pending_approval
      expect(level1.status).toBe("pending_approval");
      expect(level1.approvedBy).toBe(netengUser1.id);
      expect(level1.approvedBy2).toBeNull();

      // NetEng1 tries to give second approval -> MUST BE REJECTED
      await expect(
        provisioningService.approveOrReject(coreJobId, "approve", netengUser1)
      ).rejects.toThrow(/Second approval must be given by a distinct authorized engineer/);

      // 2nd Approval by Admin (distinct identity)
      const level2 = await provisioningService.approveOrReject(coreJobId, "approve", adminUser, "L2 Admin Final Approval");
      expect(level2.status).toBe("approved");
      expect(level2.approvedBy2).toBe(adminUser.id);
    });
  });

  describe("Safe Execution, Default-Deny, and Dry-Run Simulations", () => {
    it("executes safe Dry-Run simulation without modifying production router hardware", async () => {
      const job = (await provisioningService.listJobs())[0];
      const dryRunResult = await provisioningService.executeDryRun(job.id, netengUser1);

      expect(dryRunResult.success).toBe(true);
      expect(dryRunResult.log).toContain("[SIMULATED_MOCK_ADAPTER] DRY-RUN SUCCESSFUL: 0 commands pushed");

      const refreshed = await provisioningService.getJobById(job.id);
      expect(refreshed?.executionStatus).toBe("simulated");
    });

    it("GUARDRAIL 1: rejects Live Execution when ROUTER_LIVE_EXECUTION_ENABLED is false", async () => {
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "false";
      process.env.ROUTER_PROVISIONING_ENABLED = "false";

      const jobs = await provisioningService.listJobs({ status: "approved" });
      const approvedJob = jobs[0];
      expect(approvedJob).toBeDefined();

      await expect(
        provisioningService.executeLive(approvedJob.id, netengUser1)
      ).rejects.toThrow(/Live router provisioning is disabled by default in server environment/);
    });

    it("GUARDRAIL 2: rejects Live Execution when router IP is not in ROUTER_ALLOWLIST", async () => {
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "true";
      process.env.ROUTER_PROVISIONING_ENABLED = "true";
      process.env.ROUTER_ALLOWLIST = "192.168.99.1,192.168.99.2"; // Target router 10.10.10.1 is NOT here

      const jobs = await provisioningService.listJobs({ status: "approved" });
      const approvedJob = jobs[0];

      await expect(
        provisioningService.executeLive(approvedJob.id, netengUser1)
      ).rejects.toThrow(/is not present in ROUTER_ALLOWLIST/);
    });

    it("GUARDRAIL 4: rejects Live Execution when mock adapter is active (locks mock from claiming applied status)", async () => {
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "true";
      process.env.ROUTER_PROVISIONING_ENABLED = "true";
      process.env.ROUTER_ALLOWLIST = "10.10.10.1,10.20.20.1";
      // Ensure physical driver is NOT enabled (mock adapter active)
      delete process.env.ROUTER_PHYSICAL_DRIVER_ENABLED;
      delete process.env.ROUTER_ADAPTER_TYPE;

      const jobs = await provisioningService.listJobs({ status: "approved" });
      const approvedJob = jobs.find((j) => j.managementIp === "10.10.10.1");
      expect(approvedJob).toBeDefined();

      // Must reject live execution because mock adapter cannot claim live execution
      await expect(
        provisioningService.executeLive(approvedJob!.id, netengUser1)
      ).rejects.toThrow(/Physical router driver is not installed \(mock adapter active\)/);

      // Verify job status was NOT changed to applied
      const unchanged = await provisioningService.getJobById(approvedJob!.id);
      expect(unchanged?.status).toBe("approved");
      expect(unchanged?.status).not.toBe("applied");
    });

    it("applies live configuration and transitions to 'applied' only when physical adapter driver is enabled", async () => {
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "true";
      process.env.ROUTER_PROVISIONING_ENABLED = "true";
      process.env.ROUTER_ALLOWLIST = "10.10.10.1,10.20.20.1"; // Allowlist target router
      // Enable physical driver for verified lab/staging test
      process.env.ROUTER_PHYSICAL_DRIVER_ENABLED = "true";
      process.env.ROUTER_ADAPTER_TYPE = "physical";

      const jobs = await provisioningService.listJobs({ status: "approved" });
      const approvedJob = jobs.find((j) => j.managementIp === "10.10.10.1");
      expect(approvedJob).toBeDefined();

      const execResult = await provisioningService.executeLive(approvedJob!.id, netengUser1);
      expect(execResult.success).toBe(true);
      expect(execResult.status).toBe("applied");
      expect(execResult.log).toContain("[PROVISIONING COMPLETE - STATUS: APPLIED]");

      const refreshed = await provisioningService.getJobById(approvedJob!.id);
      expect(refreshed?.status).toBe("applied");
      expect(refreshed?.executedBy).toBe(netengUser1.id);

      // Clean up physical driver flags
      delete process.env.ROUTER_PHYSICAL_DRIVER_ENABLED;
      delete process.env.ROUTER_ADAPTER_TYPE;
    });

    it("triggers configuration rollback and records rollback status", async () => {
      const jobs = await provisioningService.listJobs({ status: "applied" });
      const appliedJob = jobs[0];
      expect(appliedJob).toBeDefined();

      const rbResult = await provisioningService.executeRollback(appliedJob.id, adminUser);
      expect(rbResult.success).toBe(true);
      expect(rbResult.log).toContain("[ROLLBACK COMPLETED - STATUS: ROLLED_BACK]");

      const refreshed = await provisioningService.getJobById(appliedJob.id);
      expect(refreshed?.status).toBe("rolled_back");
      expect(refreshed?.rollbackExecutedBy).toBe(adminUser.id);
    });
  });
});
