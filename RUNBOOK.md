# JDP Flow Sensor Manager & Traffic Analyzer
## NOC Operational Runbook & Production Maintenance Guide

**Document Version:** 1.0.0  
**Target Audience:** ISP NOC Engineers, Network Automation Engineers, System Administrators  
**System Classification:** Internal ISP Infrastructure Observability Platform  

---

## 1. System Overview & Architecture

The **JDP Flow Sensor Manager & Traffic Analyzer** is an enterprise network observability platform combining dynamic NetFlow/sFlow/IPFIX sensor management (inspired by PRTG) with deep traffic analytics and interactive Sankey diagramming (inspired by Akvorado).

```
                      +---------------------------------------+
                      |           Core Router Farm            |
                      |  (MikroTik, Juniper, Huawei, Cisco)   |
                      +-------------------+-------------------+
                                          |
                        UDP Wire Datagrams| (2055, 6343, 9995)
                                          v
                      +---------------------------------------+
                      |      Flow Collector UDP Daemon        |
                      |   (flow-collector-service / daemon)   |
                      |  - SO_RCVBUF 4MB OS Socket Buffer     |
                      |  - Binary Parsers (v5, v9, IPFIX, sF) |
                      |  - Dynamic Sensor Registry Sync       |
                      +-------------------+-------------------+
                                          |
                         Shared ACID Bus  | WAL Mode SQLite /
                         (Queue Flush)    | ClickHouse
                                          v
                      +---------------------------------------+
                      |         Persistent Storage            |
                      |   data/jdp_noc.db (WAL Mode)          |
                      |   - flow_records, telemetry           |
                      |   - devices, sensors, provisioning    |
                      +-------------------+-------------------+
                                          ^
                         REST API Queries | Realtime Sync
                                          |
                      +-------------------+-------------------+
                      |         Next.js Web Application       |
                      |  - Traffic Analytics & Flow Explorer  |
                      |  - Interactive Multi-Mode Sankey      |
                      |  - Router Config Generator (Dual-Appr)|
                      |  - RBAC & Audit Trails                |
                      +---------------------------------------+
```

### Core Components:
1. **Next.js Web Application (`PORT=3000`)**: Web GUI, REST API, RBAC enforcement, Sankey visualizer, and Config Generator.
2. **Flow Collector UDP Daemon**: Dedicated background process listening on UDP ports `2055` (NetFlow v5/v9), `6343` (sFlow v5), and `9995` (IPFIX).
3. **Dynamic Sensor Registry**: In-memory registry with automatic synchronization from SQLite every 3 seconds. Adding or modifying sensors in the Web UI requires **zero collector restarts**.
4. **Persistent ACID Storage Bus**: SQLite in WAL mode (`data/jdp_noc.db`) ensuring cross-process state consistency between Web UI and Collector.
5. **ASN & Prefix Radix Trie**: In-memory longest prefix match (LPM) engine for sub-millisecond ASN resolution and customer network attribution.

### 1.1 Storage Architecture & Operational Boundaries
- **Active Operational Engine:** SQLite in WAL (Write-Ahead Logging) mode (`data/jdp_noc.db`).
  - Active PRAGMA configuration: `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA foreign_keys = ON;`.
  - Enforced relational integrity: Cascade delete of interfaces, sensors, and status history on device deletion; foreign key violations are rejected at database level.
- **Retention Policy & FIFO Eviction:**
  - Storage buffer is capped at **100,000 normalized flow records** in FIFO order to prevent unbounded disk growth.
  - **Operational Implication:** When query time presets are selected (e.g. `6h`, `24h`, `7d`), results will only reflect flow records within the temporal window preserved by the 100,000-record boundary.
- **ClickHouse Target Profile:**
  - ClickHouse is maintained as the **target deployment profile / architectural target** for large-scale multi-gigabit production deployments.
  - In current staging and standard deployments, ClickHouse is on standby; all active ingest and query workflows run on the SQLite WAL hybrid engine.
- **Router Provisioning Lock:**
  - Live execution (`executeLive`) is strictly locked to prevent simulated/mock adapters from producing operational status `applied`.
  - Automated provisioning to hardware requires explicit installation of physical drivers (`ROUTER_PHYSICAL_DRIVER_ENABLED=true` and `ROUTER_ADAPTER_TYPE=physical`). Dry-run simulation is always safe and unrestricted.

---

## 2. Installation & Service Deployment

### 2.1 Prerequisites
- **Operating System:** Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9 recommended) or Windows Server
- **Node.js:** v20.x or v22.x LTS (tested up to v24.x)
- **Memory:** Minimum 2 GB RAM (4 GB+ recommended for high flow volume)
- **Disk:** Fast NVMe/SSD storage for WAL write performance

### 2.2 Initial Setup
```bash
# 1. Clone repository and install dependencies
git clone https://github.com/jdp-noc/flow-sensor-manager.git
cd flow-sensor-manager
npm ci

# 2. Configure environment variables
cp .env.example .env
# Edit .env and set strong CREDENTIAL_ENCRYPTION_KEY and JWT_SECRET

# 3. Initialize database schema and baseline data
npm run db:migrate
npm run db:seed
```

### 2.3 Production Process Supervision

In production, run the Web Application and the Flow Collector as two separate supervised services.

#### Option A: Systemd (Recommended for Linux Host)

Create `/etc/systemd/system/jdp-web.service`:
```ini
[Unit]
Description=JDP Flow Sensor Manager Web Application
After=network.target

[Service]
Type=simple
User=noc
WorkingDirectory=/opt/jdp-flow-sensor-manager
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/jdp-collector.service`:
```ini
[Unit]
Description=JDP Flow Sensor UDP Collector Daemon
After=network.target

[Service]
Type=simple
User=noc
WorkingDirectory=/opt/jdp-flow-sensor-manager
ExecStart=/usr/bin/npm run collector
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Enable and start services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jdp-web jdp-collector
```

#### Option B: Docker Compose Deployment

```bash
# 1. Prepare Staging Environment file
cp .env.staging .env

# 2. Build and start services in background
docker compose up -d

# 3. Check container health status
docker compose ps
curl http://localhost:3000/api/health

# 4. View real-time collector ingestion logs
docker compose logs -f collector
```

### 2.4 Staging Deployment Smoke Test Suite
Before declaring any staging deployment operational, execute the automated end-to-end smoke test suite:
```bash
npx tsx scripts/smoke-test-staging.ts
```
This script executes 14 automated verification checks:
1. SQLite PRAGMA `foreign_keys = 1` active enforcement.
2. Complete 10-table relational schema migration.
3. Cryptographic secret format validation (64-char hex key + 64-char JWT secret).
4. Demo seed rejection guard (`ENABLE_DEV_SEED=false`).
5. Provisioning mock lock (`MockRouterAdapter` active, live hardware provisioning blocked).
6. Safe dry-run simulation (`executionStatus = 'simulated'`).
7. Dynamic sensor registry synchronization without daemon restart.
8. UDP wire socket binding (`2055`, `6343`, `9995`).
9. Real RFC binary packet ingestion over UDP loopback socket.
10. Automatic sensor state machine transition (`waiting_for_flow` ➔ `active`).
11. Malformed RFC packet rejection without daemon crash.
12. Normalized flow record persistence and multi-process query retrieval in SQLite.
13. Shared daemon heartbeat tracking in `collector_telemetry` table.
14. Database backup and restore verification with SHA-256 integrity validation.

### 2.5 Staging Administrator Provisioning
When demo seeding is disabled (`ENABLE_DEV_SEED=false`), bootstrap an initial staging administrator using:
```bash
# Automatically generates secure staging admin with random password:
npx tsx scripts/bootstrap-staging-admin.ts

# Or with custom credentials:
STAGING_ADMIN_USERNAME=stg_admin STAGING_ADMIN_PASSWORD=YourSecurePass123! npx tsx scripts/bootstrap-staging-admin.ts
```

---

## 3. Firewall & Network Configuration

### 3.1 Network Port Allocation
| Port | Protocol | Purpose | Access Source |
|---|---|---|---|
| **3000** | TCP | Web UI & REST API | Internal NOC Management Subnet / VPN |
| **2055** | UDP | NetFlow v5 / v9 Ingestion | Core Router Loopbacks / Management IPs |
| **6343** | UDP | sFlow v5 Ingestion | Core Switch / Router Loopback IPs |
| **9995** | UDP | IPFIX Ingestion | Router Loopback / Exporter IPs |

### 3.2 Linux Firewall Configuration (UFW)
```bash
# Allow NOC Web Access (restrict to internal management subnet)
sudo ufw allow from 10.200.0.0/16 to any port 3000 proto tcp comment 'JDP NOC Web UI'

# Allow Flow Ingestion from Edge & Core Routers
sudo ufw allow from 10.200.0.0/16 to any port 2055 proto udp comment 'NetFlow'
sudo ufw allow from 10.200.0.0/16 to any port 6343 proto udp comment 'sFlow'
sudo ufw allow from 10.200.0.0/16 to any port 9995 proto udp comment 'IPFIX'
```

### 3.3 Linux OS Kernel Socket Buffer Tuning
To prevent UDP buffer drops during traffic bursts or microbursts:
```bash
# Add to /etc/sysctl.d/99-jdp-flow-tuning.conf:
net.core.rmem_max = 16777216
net.core.rmem_default = 4194304
net.core.wmem_max = 16777216

# Apply changes immediately:
sudo sysctl --system
```

---

## 4. Sensor Lifecycle & State Machine Operations

Every sensor in JDP Flow Sensor Manager follows an explicit, audited finite-state lifecycle:

```
 [Draft] ──(Configure)──> [Waiting For Flow] ──(Valid UDP Flow Arrives)──> [Active]
                                 ^                                            |
                                 |                                    (No flows > 180s)
                                 |                                            v
                                 +────────────────────────────────────── [Stale]
                                                                              |
                                                                      (No flows > 600s)
                                                                              v
                                                                        [Inactive]
                                                                              |
                                     (Manual Toggle)                          v
                                [Disabled] <───────────────────────────── (Any State)
```

### State Definitions:
- **`draft`**: Configuration created, not yet registered in active lookup.
- **`waiting_for_flow`**: Registered in dynamic lookup table; listening on the wire for the first datagram from the router.
- **`active`**: Currently receiving and matching flow packets. Updated every flush interval.
- **`stale`**: No flow received within `FLOW_STALE_THRESHOLD_SECONDS` (default: 180s). Router may be experiencing packet drops or route changes.
- **`inactive`**: No flow received for extended duration (>10 minutes). Collector alerts operator.
- **`disabled`**: Administratively disabled. Incoming packets for this sensor are ignored and discarded.

### Adding Sensors Without Collector Restart
1. Navigate to **Sensors ➔ Add Sensor** in the Web UI.
2. Select target Device, Interface, Flow Protocol (NetFlow v5/v9, sFlow v5, IPFIX), and Collector Port.
3. Save. Within **3 seconds**, the collector's background synchronization thread dynamically registers the new sensor into its memory lookup trie. **No service reload is required.**

---

## 5. Router Config Generator & Controlled Provisioning

The platform features an automated configuration generator with strict ISP guardrails to prevent accidental misconfigurations or unauthorized router changes.

### 5.1 Supported Router Vendors
- **MikroTik RouterOS** (v6 `/ip traffic-flow` and v7 `/ip flow`)
- **Juniper Junos** (`services flow-monitoring` and firewall sampling)
- **Huawei VRP** (`ip netstream` aggregation and export)
- **Cisco IOS-XR** (`flow exporter-map`, `flow monitor-map`)

### 5.2 Controlled Provisioning Workflow (4-Eyes Principle)
1. **Config Generation:** Network Engineer selects device, sensor, and target interfaces. The engine compiles vendor-specific CLI syntax and calculates a unique **SHA-256 snapshot hash**.
2. **Anti-Self-Approval Enforcement:** The user who generated the configuration job **CANNOT** approve it. The system strictly rejects self-approvals (`403 Forbidden`).
3. **Dual-Approval Requirement:** A second engineer (role `admin` or `neteng`) must review the diff, inspect parameters, and approve the job.
4. **Dry-Run Validation:** The engine executes a read-only syntax check and validation against simulated router state.
5. **Default-Deny Live Guardrails:**
   - Live execution to physical routers is disabled by default (`ROUTER_LIVE_EXECUTION_ENABLED=false`).
   - Routers must exist in `ROUTER_ALLOWLIST_IPS` to permit live execution.
6. **One-Click Rollback:** Every applied configuration generates an inverted rollback script (`undo` / `delete` / `remove`) allowing instant reversion if operational anomalies occur.

---

## 6. Troubleshooting Playbook

### Playbook 1: Sensor Stuck in `waiting_for_flow`
**Symptom:** Sensor was provisioned but status remains `waiting_for_flow`.

**Diagnostic Steps:**
1. Check collector telemetry status via Web UI (`/collector`) or REST API:
   ```bash
   curl http://localhost:3000/api/collector/status
   ```
2. Verify UDP packets are reaching the server host using `tcpdump`:
   ```bash
   sudo tcpdump -i any -nn "udp port 2055 and host <ROUTER_MANAGEMENT_IP>"
   ```
   - *If no packets appear:* Check router firewall, routing table, and flow exporter configuration.
   - *If packets appear:* Check server firewall (`sudo ufw status`) and exporter IP match.
3. Verify Exporter IP Matching:
   - JDP matches flows based on the source IP of the UDP datagram matching the device's `managementIp` in the database.
   - If the router exports from a loopback or secondary interface (e.g. `10.200.0.1`) but the device was registered with `192.168.1.1`, the collector treats it as `unknownExporter`.
   - *Fix:* Update Device Management IP to match the router's flow export source IP.

---

### Playbook 2: High Packet Drop Rate (`packetsDropped` or OS Buffer Overflow)
**Symptom:** Collector telemetry reports dropped packets during peak ISP traffic hours.

**Diagnostic Steps:**
1. Check OS UDP buffer drop statistics:
   ```bash
   netstat -su | grep -E "receive errors|buffer errors"
   ```
2. Ensure `setRecvBufferSize(4 * 1024 * 1024)` is active in Node.js (default in JDP Phase 8).
3. Increase OS UDP socket buffer via `sysctl`:
   ```bash
   sudo sysctl -w net.core.rmem_max=16777216
   ```
4. Verify Router Sampling Rate:
   - Wire-rate 1:1 flow export on 10G/100G interfaces will overwhelm any flow collector.
   - Ensure the router configuration uses a realistic sampling rate:
     - 1G interfaces: 1:500 or 1:1000
     - 10G interfaces: 1:2000 or 1:5000
     - 100G interfaces: 1:10000

---

### Playbook 3: Malformed Packet Alerts (`packetsMalformed > 0`)
**Symptom:** Telemetry shows `packetsMalformed` increasing.

**Diagnostic Steps:**
1. Identify protocol error breakdown in `/api/collector/status` (`parseErrorsByProtocol`).
2. Common causes:
   - **NetFlow v9 / IPFIX Template Not Received:** Routers export templates periodically (default 30m). Until the first template arrives, v9 records cannot be decoded.
   - *Fix:* Configure router to send templates more frequently:
     ```
     # MikroTik:
     /ip traffic-flow set template-refresh=1m
     # Juniper:
     template-refresh-rate packets 1000 seconds 60
     ```
   - **MTU Truncation:** UDP packet was fragmented or truncated by transit network MTU. Ensure MTU is $\ge 1500$ between router and collector.

---

### Playbook 4: Traffic Shows "Unknown / Unallocated ASN" or "External Network"
**Symptom:** Sankey or Flow Explorer displays high percentage of unmapped ASNs.

**Diagnostic Steps:**
1. Navigate to **ASN Enrichment ➔ Prefix Mappings** in Web UI.
2. Check if the target IP subnet is registered in the Radix Trie.
3. Add missing CIDR prefix with corresponding ASN.
4. Changes are loaded immediately into the in-memory Radix Trie without restarting services.

---

## 7. Database Maintenance, Backup & Recovery

### 7.1 Automated Online Backup
The database backup utility flushes active SQLite WAL logs, generates an atomic timestamped snapshot, computes SHA-256 verification checksums, and manages backup retention (keeping the last 10 snapshots):

```bash
# Execute manual backup:
npm run tsx scripts/backup-db.ts

# Output:
# [SUCCESS] Backup completed successfully!
#   File:     data/backups/jdp_noc_backup_2026-10-29_16-09-27.db
#   Checksum: 562ac6b23f83b0153f5c0b9ba618c9c7e1340a2862945c77cfe8543650adec22
```

#### Crontab Setup for Daily Automated Backups:
```cron
# Run daily backup at 02:00 AM
0 2 * * * cd /opt/jdp-flow-sensor-manager && /usr/bin/npm run tsx scripts/backup-db.ts >> /var/log/jdp-backup.log 2>&1
```

### 7.2 Database Restoration & Disaster Recovery
In case of server failure or database corruption:

```bash
# 1. Stop active services
sudo systemctl stop jdp-web jdp-collector

# 2. Restore database from latest backup (or specify path)
npx tsx scripts/restore-db.ts data/backups/jdp_noc_backup_2026-10-29_16-09-27.db

# 3. Restart services
sudo systemctl start jdp-web jdp-collector
```

### 7.3 SQLite Integrity Check
```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: 'file:./data/jdp_noc.db' });
c.execute('PRAGMA integrity_check;').then(r => console.log('Integrity:', r.rows[0]));
"
```

---

## 8. Security & Credential Rotation

### 8.1 Rotating AES-256-GCM Credential Encryption Key
When rotating `CREDENTIAL_ENCRYPTION_KEY`:
1. Generate new 32-byte hex key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Decrypt existing device credentials with current key and re-encrypt with new key.
3. Update `.env` and restart application services.

### 8.2 Role-Based Access Control (RBAC) Hierarchy
- **`admin`**: Full system control, user management, audit review, live provisioning approval.
- **`neteng`**: Device onboarding, sensor creation, router config generation & dual-approval.
- **`operator`**: Device and sensor view, config generation, dry-run testing (cannot approve).
- **`analyst`**: Read-only traffic analysis, Flow Explorer, Top ASNs, and Sankey visualization.

---

**End of Runbook — JDP Flow Sensor Manager Operations Team**

