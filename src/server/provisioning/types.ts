/**
 * Type definitions for Router Config Generator and Controlled Provisioning Engine.
 */

export type ProvisioningMode = "manual" | "dryrun" | "automatic";

export type ProvisioningStatus =
  | "draft"
  | "validated"
  | "pending_approval"
  | "approved"
  | "executing"
  | "applied"
  | "failed"
  | "rejected"
  | "rollback_pending"
  | "rolled_back"
  | "cancelled";

export type CompatibilityStatus = "verified" | "unverified" | "unsupported";

export interface TargetInterface {
  ifIndex?: number | null;
  ifName: string;
  ifAlias?: string | null;
}

export interface ConfigTemplateContext {
  deviceName: string;
  vendor: string;
  model?: string | null;
  osVersion?: string | null;
  managementIp: string;
  exporterIp: string; // Source IP configured on router for exporter packets
  collectorIp: string; // Destination collector IP address
  collectorPort: number; // Collector UDP port (e.g. 2055, 6343, 9995)
  protocol: "netflow_v5" | "netflow_v9" | "ipfix" | "sflow_v5";
  samplingRate: number; // e.g. 1000
  direction: "ingress" | "egress" | "both";
  interfaces: TargetInterface[];
  autonomousSystem?: number | null;
  options?: Record<string, any>;
}

export interface GeneratedConfigResult {
  templateId: string;
  templateName: string;
  vendor: string;
  compatibilityStatus: CompatibilityStatus;
  isLiveExecutionSupported: boolean;
  configurationCommands: string;
  verificationCommands: string;
  rollbackCommands: string;
  warnings: string[];
  prerequisites: string[];
  summary: string;
  snapshotHash: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface VendorTemplate {
  id: string;
  name: string;
  vendor: string;
  family: string;
  description: string;
  supportedModels: string[];
  supportedOsVersions: string[];
  supportedProtocols: string[];
  compatibilityStatus: CompatibilityStatus;
  isLiveExecutionSupported: boolean;
  prerequisites: string[];
  validate(ctx: ConfigTemplateContext): TemplateValidationResult;
  generate(ctx: ConfigTemplateContext): GeneratedConfigResult;
}

export interface ProvisioningJobDetail {
  id: string;
  title: string;
  deviceId: string;
  deviceHostname?: string;
  requestedBy: string;
  requestedByUsername?: string;
  approvedBy?: string | null;
  approvedByUsername?: string | null;
  approvedBy2?: string | null;
  approvedBy2Username?: string | null;
  vendor: string;
  templateId: string;
  templateName?: string;
  sensorIds: string[];
  targetInterfaces: TargetInterface[];
  managementIp: string;
  exporterIp: string;
  collectorIp: string;
  collectorPort: number;
  protocol: string;
  samplingRate: number;
  direction: string;
  mode: ProvisioningMode;
  status: ProvisioningStatus;
  generatedConfig: string;
  verificationCommands?: string | null;
  rollbackConfig?: string | null;
  configHash: string;
  validationWarnings?: string[] | null;
  approvalNotes?: string | null;
  rejectionReason?: string | null;
  executionLog?: string | null;
  executionStatus?: "simulated" | "success" | "failed" | "uncertain" | null;
  executionDurationMs?: number | null;
  executedBy?: string | null;
  executedByUsername?: string | null;
  rollbackExecutedAt?: string | null;
  rollbackExecutedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt?: string | null;
  approvals?: ProvisioningApprovalRecord[];
}

export interface ProvisioningApprovalRecord {
  id: string;
  jobId: string;
  userId: string;
  username: string;
  userRole: string;
  action: "approve" | "reject";
  approvalLevel: number;
  notes?: string | null;
  snapshotHash: string;
  createdAt: string;
}

