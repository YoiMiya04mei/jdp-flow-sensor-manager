import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * USERS TABLE
 * Phase: Phase 1 (Active)
 * Description: Stores authenticated users and RBAC roles (admin, neteng, operator, analyst).
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "neteng", "operator", "analyst"] })
    .notNull()
    .default("operator"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * DEVICES TABLE
 * Phase: Phase 1 (Foundation Schema) / Phase 2 (Active Management)
 * Description: Network routers, switches, and firewalls acting as flow exporters.
 */
export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull().unique(),
    managementIp: text("management_ip").notNull().unique(),
    vendor: text("vendor", {
      enum: ["juniper", "huawei", "mikrotik", "cisco", "nokia", "zte", "other"],
    }).notNull(),
    model: text("model"),
    role: text("role", {
      enum: ["core", "edge", "distribution", "access", "firewall", "other"],
    })
      .notNull()
      .default("edge"),
    asnNumber: integer("asn_number"),
    asnName: text("asn_name"),
    locationSite: text("location_site"),
    snmpVersion: text("snmp_version", { enum: ["v2c", "v3"] }).default("v3"),
    snmpPort: integer("snmp_port").default(161),
    // Credentials encrypted using AES-256-GCM. NEVER returned in plaintext.
    snmpCommunityEncrypted: text("snmp_community_encrypted"),
    snmpV3User: text("snmp_v3_user"),
    snmpV3AuthProto: text("snmp_v3_auth_proto"),
    snmpV3AuthPassEncrypted: text("snmp_v3_auth_pass_encrypted"),
    snmpV3PrivProto: text("snmp_v3_priv_proto"),
    snmpV3PrivPassEncrypted: text("snmp_v3_priv_pass_encrypted"),
    status: text("status", {
      enum: ["active", "unreachable", "maintenance", "disabled"],
    })
      .notNull()
      .default("active"),
    tags: text("tags"), // Comma-separated or JSON tags
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    mgmtIpIdx: index("idx_devices_mgmt_ip").on(table.managementIp),
    vendorIdx: index("idx_devices_vendor").on(table.vendor),
  })
);

/**
 * INTERFACES TABLE
 * Phase: Phase 1 (Foundation Schema) / Phase 2 (SNMP Interface Discovery)
 * Description: Network interfaces discovered on routers for flow sensor attachment.
 */
export const interfaces = sqliteTable(
  "interfaces",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    ifIndex: integer("if_index").notNull(),
    ifName: text("if_name").notNull(),
    ifAlias: text("if_alias"),
    ifSpeed: integer("if_speed"),
    ifOperStatus: text("if_oper_status", { enum: ["up", "down", "testing"] }).default("up"),
    lastDiscoveredAt: text("last_discovered_at").notNull(),
  },
  (table) => ({
    deviceIfIdx: index("idx_interfaces_device_if").on(table.deviceId, table.ifIndex),
  })
);

/**
 * SENSORS TABLE
 * Phase: Phase 1 (Foundation Schema) / Phase 3 & 4 (Active Lifecycle & Ingestion)
 * Description: Flow monitoring sensors bound to device interfaces and protocols.
 */
export const sensors = sqliteTable(
  "sensors",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    protocol: text("protocol", {
      enum: ["netflow_v5", "netflow_v9", "ipfix", "sflow_v5"],
    }).notNull(),
    collectorIp: text("collector_ip").notNull().default("0.0.0.0"),
    collectorPort: integer("collector_port").notNull().default(2055),
    ifIndex: integer("if_index"),
    samplingRate: integer("sampling_rate").notNull().default(1000),
    direction: text("direction", { enum: ["ingress", "egress", "both"] })
      .notNull()
      .default("both"),
    status: text("status", {
      enum: ["draft", "waiting_for_flow", "active", "stale", "error", "disabled"],
    })
      .notNull()
      .default("waiting_for_flow"),
    lastFlowAt: text("last_flow_at"),
    totalFlowsReceived: integer("total_flows_received").default(0),
    totalBytesReceived: integer("total_bytes_received").default(0),
    totalPacketsReceived: integer("total_packets_received").default(0),
    lastErrorMessage: text("last_error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    deviceSensorIdx: index("idx_sensors_device").on(table.deviceId),
    statusIdx: index("idx_sensors_status").on(table.status),
  })
);

/**
 * SENSOR STATUS HISTORY TABLE
 * Phase: Phase 1 (Foundation Schema) / Phase 3 & 4 (State Machine Tracking)
 * Description: Audit log for sensor state transitions (e.g. Waiting -> Active -> Stale).
 */
export const sensorStatusHistory = sqliteTable(
  "sensor_status_history",
  {
    id: text("id").primaryKey(),
    sensorId: text("sensor_id")
      .notNull()
      .references(() => sensors.id, { onDelete: "cascade" }),
    oldStatus: text("old_status").notNull(),
    newStatus: text("new_status").notNull(),
    triggerReason: text("trigger_reason").notNull(),
    changedAt: text("changed_at").notNull(),
  },
  (table) => ({
    sensorHistoryIdx: index("idx_sensor_history").on(table.sensorId),
  })
);

/**
 * ASN DIRECTORY TABLE
 * Phase: Phase 1 (Foundation Schema) / Phase 6 (ASN Enrichment & BGP Directory)
 * Description: Reference directory mapping ASNs to organization names and classifications.
 */
export const asnDirectory = sqliteTable(
  "asn_directory",
  {
    asn: integer("asn").primaryKey(),
    name: text("name").notNull(),
    country: text("country").notNull().default("ID"),
    organizationType: text("organization_type", {
      enum: ["tier1", "transit", "content_cdn", "eyeball_isp", "enterprise"],
    }).default("transit"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    asnIdx: index("idx_asn_dir_asn").on(table.asn),
  })
);

/**
 * AUDIT LOGS TABLE
 * Phase: Phase 1 (Active)
 * Description: Immutable audit trail recording user operations, configuration edits, and approvals.
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    username: text("username").notNull(),
    action: text("action").notNull(),
    targetEntity: text("target_entity").notNull(),
    targetId: text("target_id"),
    diffJson: text("diff_json"),
    ipAddress: text("ip_address"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    userAuditIdx: index("idx_audit_user").on(table.userId),
    actionIdx: index("idx_audit_action").on(table.action),
    createdAtIdx: index("idx_audit_created_at").on(table.createdAt),
  })
);

/**
 * PROVISIONING JOBS TABLE
 * Phase: Phase 1 (Foundation Schema) / Phase 7 (Controlled Provisioning Engine)
 * Description: Queue, snapshots, approval records, and execution log for router exporter provisioning.
 */
export const provisioningJobs = sqliteTable(
  "provisioning_jobs",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id),
    approvedBy: text("approved_by").references(() => users.id),
    approvedBy2: text("approved_by_2").references(() => users.id),
    vendor: text("vendor").notNull(),
    templateId: text("template_id").notNull(),
    sensorIdsJson: text("sensor_ids_json"), // JSON string array of sensor IDs
    targetInterfacesJson: text("target_interfaces_json"), // JSON string array of interface names
    managementIp: text("management_ip").notNull(),
    exporterIp: text("exporter_ip").notNull(),
    collectorIp: text("collector_ip").notNull(),
    collectorPort: integer("collector_port").notNull().default(2055),
    protocol: text("protocol").notNull().default("netflow_v9"),
    samplingRate: integer("sampling_rate").notNull().default(1000),
    direction: text("direction").notNull().default("both"),
    mode: text("mode", { enum: ["manual", "dryrun", "automatic"] })
      .notNull()
      .default("manual"),
    status: text("status", {
      enum: [
        "draft",
        "validated",
        "pending_approval",
        "approved",
        "executing",
        "applied",
        "failed",
        "rejected",
        "rollback_pending",
        "rolled_back",
        "cancelled",
      ],
    })
      .notNull()
      .default("draft"),
    generatedConfig: text("generated_config").notNull(),
    verificationCommands: text("verification_commands"),
    rollbackConfig: text("rollback_config"),
    configHash: text("config_hash").notNull(),
    validationWarnings: text("validation_warnings"), // JSON string array of warnings
    approvalNotes: text("approval_notes"),
    rejectionReason: text("rejection_reason"),
    executionLog: text("execution_log"),
    executionStatus: text("execution_status"), // "simulated" | "success" | "failed" | "uncertain"
    executionDurationMs: integer("execution_duration_ms"),
    executedBy: text("executed_by").references(() => users.id),
    rollbackExecutedAt: text("rollback_executed_at"),
    rollbackExecutedBy: text("rollback_executed_by").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    executedAt: text("executed_at"),
  },
  (table) => ({
    deviceJobIdx: index("idx_prov_device").on(table.deviceId),
    statusJobIdx: index("idx_prov_status").on(table.status),
    createdAtJobIdx: index("idx_prov_created_at").on(table.createdAt),
  })
);

/**
 * PROVISIONING APPROVALS TABLE
 * Phase: Phase 7 (Controlled Provisioning Engine - Immutable Approval Trail)
 * Description: Immutable records of multi-level approvals, rejections, and snapshot hashes.
 */
export const provisioningApprovals = sqliteTable(
  "provisioning_approvals",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => provisioningJobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    username: text("username").notNull(),
    userRole: text("user_role").notNull(),
    action: text("action", { enum: ["approve", "reject"] }).notNull(),
    approvalLevel: integer("approval_level").notNull().default(1),
    notes: text("notes"),
    snapshotHash: text("snapshot_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    jobApprovalIdx: index("idx_prov_appr_job").on(table.jobId),
  })
);

/**
 * PREFIX MAPPING TABLE
 * Phase: Phase 6 (ASN Enrichment & BGP Prefix Mapping)
 * Description: Maps IPv4/IPv6 CIDR prefixes to origin ASN numbers.
 */
export const prefixMapping = sqliteTable(
  "prefix_mapping",
  {
    id: text("id").primaryKey(),
    cidr: text("cidr").notNull().unique(),
    family: text("family", { enum: ["ipv4", "ipv6"] }).notNull().default("ipv4"),
    asn: integer("asn")
      .notNull()
      .references(() => asnDirectory.asn, { onDelete: "cascade" }),
    source: text("source").notNull().default("manual"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    cidrIdx: index("idx_prefix_cidr").on(table.cidr),
    asnIdx: index("idx_prefix_asn").on(table.asn),
  })
);

/**
 * CUSTOMER NETWORKS TABLE
 * Phase: Phase 6 (Customer / Internal Network Prefix Mapping & Sankey Mode B)
 * Description: Maps internal and subscriber prefixes to organizational networks.
 */
export const customerNetworks = sqliteTable(
  "customer_networks",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    cidr: text("cidr").notNull().unique(),
    family: text("family", { enum: ["ipv4", "ipv6"] }).notNull().default("ipv4"),
    networkType: text("network_type", {
      enum: ["customer", "internal", "infrastructure", "partner"],
    })
      .notNull()
      .default("customer"),
    asn: integer("asn"),
    description: text("description"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    custCidrIdx: index("idx_cust_cidr").on(table.cidr),
    custNameIdx: index("idx_cust_name").on(table.name),
  })
);

/**
 * FLOW RECORDS TABLE
 * Phase: Phase 8 (Persistent Multi-Process Flow Analytics Storage)
 * Description: Normalized flow records persisted across collector daemon and web application.
 */
export const flowRecords = sqliteTable(
  "flow_records",
  {
    id: text("id").primaryKey(),
    timestamp: integer("timestamp").notNull(), // epoch ms
    receivedAt: text("received_at").notNull(),
    exporterIp: text("exporter_ip").notNull(),
    exporterPort: integer("exporter_port").notNull(),
    collectorPort: integer("collector_port").notNull(),
    sensorId: text("sensor_id").references(() => sensors.id, { onDelete: "set null" }),
    deviceId: text("device_id").references(() => devices.id, { onDelete: "set null" }),
    protocol: text("protocol").notNull(),
    ipVersion: integer("ip_version").notNull().default(4),
    srcIp: text("src_ip").notNull(),
    dstIp: text("dst_ip").notNull(),
    srcPort: integer("src_port"),
    dstPort: integer("dst_port"),
    ipProtocol: integer("ip_protocol").notNull(),
    tcpFlags: integer("tcp_flags"),
    inIfIndex: integer("in_if_index"),
    outIfIndex: integer("out_if_index"),
    packetCount: integer("packet_count").notNull(),
    byteCount: integer("byte_count").notNull(),
    samplingRate: integer("sampling_rate").notNull().default(1000),
    samplingAdjustedPackets: integer("sampling_adjusted_packets").notNull(),
    samplingAdjustedBytes: integer("sampling_adjusted_bytes").notNull(),
    srcAsn: integer("src_asn"),
    dstAsn: integer("dst_asn"),
    completeness: text("completeness").notNull().default("complete"),
  },
  (table) => ({
    tsIdx: index("idx_flow_records_ts").on(table.timestamp),
    sensorTsIdx: index("idx_flow_records_sensor_ts").on(table.sensorId, table.timestamp),
    deviceTsIdx: index("idx_flow_records_device_ts").on(table.deviceId, table.timestamp),
    srcIpIdx: index("idx_flow_records_src_ip").on(table.srcIp),
    dstIpIdx: index("idx_flow_records_dst_ip").on(table.dstIp),
    srcAsnIdx: index("idx_flow_records_src_asn").on(table.srcAsn),
    dstAsnIdx: index("idx_flow_records_dst_asn").on(table.dstAsn),
  })
);

/**
 * COLLECTOR TELEMETRY & HEARTBEAT TABLE
 * Phase: Phase 8 (Ground-Truth Ingestion Daemon Heartbeat & Telemetry)
 * Description: Live heartbeat published by collector daemon for web application status observability.
 */
export const collectorTelemetry = sqliteTable(
  "collector_telemetry",
  {
    id: text("id").primaryKey(), // e.g. "active_daemon"
    pid: integer("pid").notNull(),
    state: text("state").notNull(), // "running" | "stopped" | "error"
    listenHost: text("listen_host").notNull(),
    portsJson: text("ports_json").notNull(),
    packetsReceived: integer("packets_received").notNull().default(0),
    packetsValid: integer("packets_valid").notNull().default(0),
    packetsMalformed: integer("packets_malformed").notNull().default(0),
    packetsUnsupported: integer("packets_unsupported").notNull().default(0),
    flowsParsed: integer("flows_parsed").notNull().default(0),
    flowsMatched: integer("flows_matched").notNull().default(0),
    unknownExporters: integer("unknown_exporters").notNull().default(0),
    parseErrorsJson: text("parse_errors_json"),
    templateStatsJson: text("template_stats_json"),
    lastPacketAt: text("last_packet_at"),
    startedAt: text("started_at").notNull(),
    updatedAt: text("updated_at").notNull(), // heartbeat timestamp
  },
  (table) => ({
    updatedAtIdx: index("idx_collector_telemetry_updated").on(table.updatedAt),
  })
);


