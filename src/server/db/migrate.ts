import { sqliteClient, ensureDatabasePragmas } from "./index";

export async function runMigrations() {
  console.log("Starting database migrations...");
  await ensureDatabasePragmas();

  // USERS TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // DEVICES TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      management_ip TEXT NOT NULL UNIQUE,
      vendor TEXT NOT NULL,
      model TEXT,
      role TEXT NOT NULL DEFAULT 'edge',
      asn_number INTEGER,
      asn_name TEXT,
      location_site TEXT,
      snmp_version TEXT DEFAULT 'v3',
      snmp_port INTEGER DEFAULT 161,
      snmp_community_encrypted TEXT,
      snmp_v3_user TEXT,
      snmp_v3_auth_proto TEXT,
      snmp_v3_auth_pass_encrypted TEXT,
      snmp_v3_priv_proto TEXT,
      snmp_v3_priv_pass_encrypted TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      tags TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_devices_mgmt_ip ON devices(management_ip);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_devices_vendor ON devices(vendor);`);

  // INTERFACES TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS interfaces (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      if_index INTEGER NOT NULL,
      if_name TEXT NOT NULL,
      if_alias TEXT,
      if_speed INTEGER,
      if_oper_status TEXT DEFAULT 'up',
      last_discovered_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_interfaces_device_if ON interfaces(device_id, if_index);`);

  // SENSORS TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS sensors (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      protocol TEXT NOT NULL,
      collector_ip TEXT NOT NULL DEFAULT '0.0.0.0',
      collector_port INTEGER NOT NULL DEFAULT 2055,
      if_index INTEGER,
      sampling_rate INTEGER NOT NULL DEFAULT 1000,
      direction TEXT NOT NULL DEFAULT 'both',
      status TEXT NOT NULL DEFAULT 'waiting_for_flow',
      last_flow_at TEXT,
      total_flows_received INTEGER DEFAULT 0,
      total_bytes_received INTEGER DEFAULT 0,
      total_packets_received INTEGER DEFAULT 0,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // Try adding description column in case sensors table was already created in Phase 1
  try {
    await sqliteClient.execute(`ALTER TABLE sensors ADD COLUMN description TEXT;`);
  } catch {
    // Column already exists, ignore
  }
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_sensors_device ON sensors(device_id);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_sensors_status ON sensors(status);`);

  // SENSOR STATUS HISTORY TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS sensor_status_history (
      id TEXT PRIMARY KEY,
      sensor_id TEXT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      old_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_sensor_history ON sensor_status_history(sensor_id);`);

  // ASN DIRECTORY TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS asn_directory (
      asn INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'ID',
      organization_type TEXT DEFAULT 'transit',
      updated_at TEXT NOT NULL
    );
  `);

  // AUDIT LOGS TABLE
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      target_id TEXT,
      diff_json TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);`);

  // PROVISIONING JOBS TABLE (Phase 1 Foundation + Phase 7 Extensions)
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS provisioning_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Router Flow Config',
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL REFERENCES users(id),
      approved_by TEXT REFERENCES users(id),
      approved_by_2 TEXT REFERENCES users(id),
      vendor TEXT NOT NULL,
      template_id TEXT NOT NULL DEFAULT 'generic',
      sensor_ids_json TEXT,
      target_interfaces_json TEXT,
      management_ip TEXT NOT NULL DEFAULT '127.0.0.1',
      exporter_ip TEXT NOT NULL DEFAULT '127.0.0.1',
      collector_ip TEXT NOT NULL DEFAULT '127.0.0.1',
      collector_port INTEGER NOT NULL DEFAULT 2055,
      protocol TEXT NOT NULL DEFAULT 'netflow_v9',
      sampling_rate INTEGER NOT NULL DEFAULT 1000,
      direction TEXT NOT NULL DEFAULT 'both',
      mode TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'draft',
      generated_config TEXT NOT NULL,
      verification_commands TEXT,
      rollback_config TEXT,
      config_hash TEXT NOT NULL DEFAULT '',
      validation_warnings TEXT,
      approval_notes TEXT,
      rejection_reason TEXT,
      execution_log TEXT,
      execution_status TEXT,
      execution_duration_ms INTEGER,
      executed_by TEXT REFERENCES users(id),
      rollback_executed_at TEXT,
      rollback_executed_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      executed_at TEXT
    );
  `);
  // Ensure Phase 7 columns exist if provisioning_jobs was created in earlier phases
  const provJobCols = [
    `ALTER TABLE provisioning_jobs ADD COLUMN title TEXT NOT NULL DEFAULT 'Router Flow Config'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN template_id TEXT NOT NULL DEFAULT 'generic'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN sensor_ids_json TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN target_interfaces_json TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN management_ip TEXT NOT NULL DEFAULT '127.0.0.1'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN exporter_ip TEXT NOT NULL DEFAULT '127.0.0.1'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN collector_ip TEXT NOT NULL DEFAULT '127.0.0.1'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN collector_port INTEGER NOT NULL DEFAULT 2055`,
    `ALTER TABLE provisioning_jobs ADD COLUMN protocol TEXT NOT NULL DEFAULT 'netflow_v9'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN sampling_rate INTEGER NOT NULL DEFAULT 1000`,
    `ALTER TABLE provisioning_jobs ADD COLUMN direction TEXT NOT NULL DEFAULT 'both'`,
    `ALTER TABLE provisioning_jobs ADD COLUMN config_hash TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE provisioning_jobs ADD COLUMN verification_commands TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN validation_warnings TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN approved_by_2 TEXT REFERENCES users(id)`,
    `ALTER TABLE provisioning_jobs ADD COLUMN approval_notes TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN rejection_reason TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN execution_status TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN execution_duration_ms INTEGER`,
    `ALTER TABLE provisioning_jobs ADD COLUMN executed_by TEXT REFERENCES users(id)`,
    `ALTER TABLE provisioning_jobs ADD COLUMN rollback_executed_at TEXT`,
    `ALTER TABLE provisioning_jobs ADD COLUMN rollback_executed_by TEXT REFERENCES users(id)`,
    `ALTER TABLE provisioning_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`,
  ];
  for (const alterSql of provJobCols) {
    try {
      await sqliteClient.execute(alterSql);
    } catch {
      // Column already exists, safe to ignore
    }
  }
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_prov_device ON provisioning_jobs(device_id);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_prov_status ON provisioning_jobs(status);`);

  // PROVISIONING APPROVALS TABLE (Phase 7 Dual-Approval & Audit Trail)
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS provisioning_approvals (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES provisioning_jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      username TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      approval_level INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_prov_appr_job ON provisioning_approvals(job_id);`);

  // PREFIX MAPPING TABLE (Phase 6)
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS prefix_mapping (
      id TEXT PRIMARY KEY,
      cidr TEXT NOT NULL UNIQUE,
      family TEXT NOT NULL DEFAULT 'ipv4',
      asn INTEGER NOT NULL REFERENCES asn_directory(asn) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'manual',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_prefix_cidr ON prefix_mapping(cidr);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_prefix_asn ON prefix_mapping(asn);`);

  // CUSTOMER NETWORKS TABLE (Phase 6)
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS customer_networks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cidr TEXT NOT NULL UNIQUE,
      family TEXT NOT NULL DEFAULT 'ipv4',
      network_type TEXT NOT NULL DEFAULT 'customer',
      asn INTEGER,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_cust_cidr ON customer_networks(cidr);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_cust_name ON customer_networks(name);`);

  // FLOW RECORDS TABLE (Phase 8 - Shared Persistent Analytics Buffer)
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS flow_records (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      exporter_ip TEXT NOT NULL,
      exporter_port INTEGER NOT NULL,
      collector_port INTEGER NOT NULL,
      sensor_id TEXT REFERENCES sensors(id) ON DELETE SET NULL,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      protocol TEXT NOT NULL,
      ip_version INTEGER NOT NULL DEFAULT 4,
      src_ip TEXT NOT NULL,
      dst_ip TEXT NOT NULL,
      src_port INTEGER NOT NULL,
      dst_port INTEGER NOT NULL,
      ip_protocol INTEGER NOT NULL,
      tcp_flags INTEGER,
      in_if_index INTEGER,
      out_if_index INTEGER,
      packet_count INTEGER NOT NULL,
      byte_count INTEGER NOT NULL,
      sampling_rate INTEGER NOT NULL DEFAULT 1000,
      sampling_adjusted_packets INTEGER NOT NULL,
      sampling_adjusted_bytes INTEGER NOT NULL,
      src_asn INTEGER,
      dst_asn INTEGER,
      completeness TEXT NOT NULL DEFAULT 'complete'
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_ts ON flow_records(timestamp);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_sensor_ts ON flow_records(sensor_id, timestamp);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_device_ts ON flow_records(device_id, timestamp);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_src_ip ON flow_records(src_ip);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_dst_ip ON flow_records(dst_ip);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_src_asn ON flow_records(src_asn);`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_flow_records_dst_asn ON flow_records(dst_asn);`);

  // COLLECTOR TELEMETRY & HEARTBEAT TABLE (Phase 8)
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS collector_telemetry (
      id TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      state TEXT NOT NULL,
      listen_host TEXT NOT NULL,
      ports_json TEXT NOT NULL,
      packets_received INTEGER NOT NULL DEFAULT 0,
      packets_valid INTEGER NOT NULL DEFAULT 0,
      packets_malformed INTEGER NOT NULL DEFAULT 0,
      packets_unsupported INTEGER NOT NULL DEFAULT 0,
      flows_parsed INTEGER NOT NULL DEFAULT 0,
      flows_matched INTEGER NOT NULL DEFAULT 0,
      unknown_exporters INTEGER NOT NULL DEFAULT 0,
      parse_errors_json TEXT,
      template_stats_json TEXT,
      last_packet_at TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS idx_collector_telemetry_updated ON collector_telemetry(updated_at);`);

  console.log("Migrations applied successfully! 10 tables initialized.");
}

// Allow direct CLI execution: tsx src/server/db/migrate.ts
if (require.main === module || process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

