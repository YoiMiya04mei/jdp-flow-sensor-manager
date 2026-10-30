# JDP Flow Sensor Manager & Traffic Analyzer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.2-black.svg)](https://nextjs.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F.svg)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0-green.svg)](https://vitest.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg)](https://tailwindcss.com/)

A modern, high-performance **Flow Sensor Manager and Traffic Analyzer** designed specifically for **ISP Network Operations Center (NOC)** environments.

The platform bridges the gap between **intuitive, dynamic sensor management** (PRTG-style) and **deep, high-dimensional flow analytics with interactive Sankey diagrams** (Akvorado-style), featuring autonomous multi-vendor router provisioning with strict ISP-grade safety guardrails.

---

## Key Features

- **Dynamic Sensor Management (Zero Config Restarts):**
  - Add, modify, or toggle flow sensors in real-time via Web UI or REST API.
  - The UDP collector automatically synchronizes from SQLite every 3 seconds—**no manual config file edits or daemon restarts required**.
  - Audited 6-stage lifecycle state machine: `draft` $\rightarrow$ `waiting_for_flow` $\rightarrow$ `active` $\rightarrow$ `stale` $\rightarrow$ `inactive` $\rightarrow$ `disabled`.

- **Multi-Protocol UDP Flow Ingestion Engine:**
  - High-throughput binary wire parsers for **NetFlow v5**, **NetFlow v9**, **IPFIX**, and **sFlow v5**.
  - 4MB OS receive buffer (`SO_RCVBUF`) with non-blocking ingestion queues.
  - Verified benchmark throughput exceeding **16,000+ flow records/sec** on commodity single-core hardware.

- **High-Dimensional Traffic Analytics & Flow Explorer:**
  - Real-time time-series volume aggregation (raw bytes vs. sampling-adjusted volumes, packets, bps, pps).
  - Multi-dimensional filtering by time range, IP address, CIDR, port, protocol, interface, and sensor.
  - Active operational storage: **SQLite in WAL mode with 100,000 flow record FIFO eviction cap**.
  - Target production architecture: **ClickHouse** profile (standby for high-scale multi-gigabit deployments).

- **ASN Enrichment & Interactive Sankey Diagrams:**
  - In-memory Longest Prefix Match (LPM) Radix Trie for sub-millisecond ASN and customer network attribution.
  - **Mode A:** Source ASN $\rightarrow$ Destination ASN traffic flows.
  - **Mode B:** Source ASN $\rightarrow$ Customer Network / Leased Line flows.
  - Interactive SVG visualizer with node drag-and-drop, link hover telemetry, and bandwidth metrics.

- **Router Config Generator & Controlled Provisioning:**
  - Automated configuration generation for **MikroTik RouterOS**, **Juniper Junos**, **Huawei VRP**, and **Cisco IOS-XR**.
  - **Strict ISP Guardrails:** SHA-256 snapshot hashing, enforced anti-self-approval, dual-approval workflow, read-only dry-runs, default-deny live execution guardrail, and one-click rollback snippet generation.

- **Enterprise Security & Audit Trails:**
  - AES-256-GCM encryption for all sensitive device secrets (SNMP communities, router credentials).
  - RBAC with 4 distinct roles: `admin`, `neteng`, `operator`, `analyst`.
  - Comprehensive, tamper-evident audit logs capturing every state transition and provisioning action.

---

## Architecture Overview

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

---

## Quick Start

### 1. Prerequisites
- **Node.js:** v20.x or v22.x LTS (compatible with v24.x)
- **npm:** v10+

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/jdp-noc/flow-sensor-manager.git
cd flow-sensor-manager

# Install production and development dependencies
npm ci

# Configure environment variables
cp .env.example .env
```

### 3. Initialize Database
```bash
# Run relational database migrations (10 tables)
npm run db:migrate

# Seed baseline ISP data, users, and ASN prefix mappings
npm run db:seed
```

> [!CAUTION]
> **DEVELOPMENT-ONLY CREDENTIALS (STRICTLY PROHIBITED IN PRODUCTION):**  
> The following baseline demo accounts are for local testing only. In `NODE_ENV=production`, database seeding is strictly blocked, and you must configure authentic accounts with high-entropy passwords.

Default credentials seeded in development:
- **Admin:** `admin` / `AdminPass123!`
- **Network Engineer:** `neteng` / `NetEngPass123!`
- **NOC Operator:** `operator` / `OperatorPass123!`
- **Analyst:** `analyst` / `AnalystPass123!`

### 4. Running the Application

In development, launch both services:

```bash
# Terminal 1: Next.js Web Application & API (Port 3000)
npm run dev

# Terminal 2: UDP Flow Collector Daemon (Ports 2055, 6343, 9995)
npm run collector
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Assurance

The project includes an end-to-end and unit test suite comprising **14 test suites and 104+ automated tests**:

```bash
# Run all automated tests
npm run test

# Run tests in watch mode
npm run test:watch

# Execute specific End-to-End workflow test
npx vitest run tests/e2e-workflow.test.ts
```

### Static Analysis & Verification
```bash
# TypeScript compiler type check
npm run typecheck

# ESLint code style and quality check
npm run lint

# Production Next.js build
npm run build
```

---

## Storage Architecture & Operational Boundaries

1. **Active Storage Engine:**
   - **SQLite WAL Mode (`data/jdp_noc.db`)** is the sole active operational storage engine for all system state (devices, sensors, provisioning jobs, audit logs) and normalized flow records.
   - Initialized with strict SQLite PRAGMAs: `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA foreign_keys = ON;`.
   - Relational integrity is enforced: foreign key violations are rejected at database level, and deleting a parent device triggers `ON DELETE CASCADE` across all child interfaces and sensors.

2. **Retention Policy & FIFO Eviction:**
   - Flow record retention is bounded by a **100,000 flow record FIFO eviction cap**.
   - **Operational Consideration:** Queries on wide time windows (e.g. 6h, 24h, 7d presets) will only return records within the temporal span of the 100k retained flows.

3. **ClickHouse Target Profile:**
   - ClickHouse is maintained in the codebase as the **target deployment profile / architecture target** for long-term multi-terabyte analytics.
   - It is not running in the active staging environment; all ingestion and queries run via the active SQLite WAL engine.

4. **Router Provisioning Lock:**
   - Live execution (`executeLive`) is strictly locked when running with the simulated mock adapter.
   - The mock adapter is prohibited from claiming live hardware success or producing operational status `applied`. Live hardware execution requires explicit installation of physical drivers (`ROUTER_PHYSICAL_DRIVER_ENABLED=true`). Dry-run simulation is always safe and unrestricted.

---

## Performance Benchmark & Reconciliation

A comprehensive benchmark utility is provided in `scripts/benchmark-collector.ts` separating parser throughput from socket integration:

```bash
# Run comprehensive parser microbenchmark & UDP loopback benchmark
npx tsx scripts/benchmark-collector.ts
```

### 1. In-Memory Parser Microbenchmark (Pure CPU decoding in RAM)
| Protocol | Packets/Sec | Flow Records/Sec | Throughput |
|---|---|---|---|
| **NetFlow v5 (30 rec/pkt)** | ~199,000 pkts/s | **~5,980,000 flows/s** | ~278 MB/s |
| **NetFlow v9 (Template-Cached)** | ~614,000 pkts/s | **~1,840,000 flows/s** | ~58 MB/s |
| **IPFIX (RFC 7011)** | ~757,000 pkts/s | **~1,515,000 flows/s** | ~52 MB/s |
| **sFlow v5 (RFC 3176)** | ~1,476,000 pkts/s | **~1,476,000 flows/s** | ~208 MB/s |

### 2. UDP Loopback Integration Benchmark (Full Pipeline Over Wire)
| Stage | Target DPS | Wire DPS | Flows / Sec | Loss % | RFC Malformed Rejection |
|---|---|---|---|---|---|
| **Paced 1,000 dps** | 1,000 dps | 627 dps | **16,933 flows/s** | **0.00%** | 100% Rejected (100/100) |
| **Paced 2,500 dps** | 2,500 dps | 597 dps | 16,095 flows/s | 59.96%* | 100% Rejected (101/101) |
| **Paced 5,000 dps** | 5,000 dps | 630 dps | 17,018 flows/s | 79.21%* | 100% Rejected (104/104) |

*\*Note on Windows loopback:* In a single-process Node.js benchmark, the packet sender and collector share a single CPU thread and event loop. When bursts exceed the OS UDP buffer, packet drops occur. In real ISP production, external router hardware ASICs transmit packets to a multi-core Linux host with `SO_RCVBUF = 16MB`. Furthermore, each NetFlow datagram carries ~30 flow records, meaning 600 wire dps $\approx$ 17,000 flow records/second.

---

## Project Structure

```
.
├── data/                       # Persistent SQLite database & backups
├── scripts/                    # Maintenance, backup, restore, benchmark scripts
│   ├── backup-db.ts            # Atomic WAL checkpointed backup with SHA-256
│   ├── restore-db.ts           # Integrity-verified database restore utility
│   └── benchmark-collector.ts  # UDP flow stress test generator
├── src/
│   ├── app/                    # Next.js App Router (Pages, UI, Layouts)
│   │   ├── (auth)/             # Login & Authentication routes
│   │   ├── (dashboard)/        # NOC Overview & Summary
│   │   ├── devices/            # Device Manager UI
│   │   ├── sensors/            # Flow Sensor Manager UI
│   │   ├── analytics/          # Traffic Analytics & Flow Explorer
│   │   ├── sankey/             # Interactive Sankey Diagram
│   │   ├── config-generator/   # Router Config Generator & Provisioning
│   │   └── api/                # REST API routes
│   ├── components/             # Reusable React UI components
│   ├── lib/                    # Shared validation schemas and utilities
│   ├── server/                 # Backend domain services & storage
│   │   ├── analytics/          # Flow storage (InMemory, SQLite, Hybrid, ClickHouse)
│   │   ├── asn/                # ASN directory, prefix Radix Trie, Sankey engine
│   │   ├── auth/               # AES-256-GCM encryption, session, RBAC
│   │   ├── collector/          # Flow Collector UDP service & binary parsers
│   │   ├── db/                 # Drizzle schema, migrations, connection pool
│   │   ├── devices/            # SNMP discovery, validation, SSRF guard
│   │   ├── provisioning/       # Router config templates, approval workflow
│   │   └── sensors/            # Dynamic sensor registry & state machine
│   └── types/                  # Core domain TypeScript type definitions
├── tests/                      # Vitest test suites (14 suites, 104+ tests)
├── docker-compose.yml          # Multi-container production deployment
├── Dockerfile                  # Multi-stage production container build
├── RUNBOOK.md                  # Comprehensive NOC ISP Operational Runbook
└── ARCHITECTURE.md             # In-depth architectural decision records
```

---

## License & Support

Internal software developed for **JDP Network Operations Center (NOC)**.  
For incident response and operational questions, refer to [RUNBOOK.md](file:///c:/Users/permadi%20pratama/OneDrive/%E6%96%87%E6%A1%A3/Project%20antigravity/Traffik%20analyzer/RUNBOOK.md).

