export type UserRole = "admin" | "neteng" | "operator" | "analyst";

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export type DeviceVendor =
  | "juniper"
  | "huawei"
  | "mikrotik"
  | "cisco"
  | "nokia"
  | "zte"
  | "other";

export type DeviceRole =
  | "core"
  | "edge"
  | "distribution"
  | "access"
  | "firewall"
  | "other";

export type DeviceStatus = "active" | "unreachable" | "maintenance" | "disabled";

export type SnmpVersion = "v2c" | "v3";

export type FlowProtocol =
  | "netflow_v5"
  | "netflow_v9"
  | "ipfix"
  | "sflow_v5";

export type FlowDirection = "ingress" | "egress" | "both";

export type SensorStatus =
  | "draft"
  | "waiting_for_flow"
  | "active"
  | "stale"
  | "error"
  | "disabled";

export type ProvisioningMode = "manual" | "dryrun" | "automatic";

export type ProvisioningStatus =
  | "pending_approval"
  | "approved"
  | "running"
  | "completed"
  | "failed"
  | "rolled_back";

export type AuditAction =
  | "login"
  | "logout"
  | "create"
  | "update"
  | "delete"
  | "test_snmp"
  | "discover_interfaces"
  | "provision_dryrun"
  | "provision_apply"
  | "system_setting_update";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, unknown> | unknown[];
}

