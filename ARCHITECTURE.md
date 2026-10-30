# ARCHITECTURE SPECIFICATION: JDP FLOW SENSOR MANAGER & TRAFFIC ANALYZER

**Version:** 1.0  
**Status:** Approved for Implementation  
**Standard:** Clean Architecture / Domain-Driven Modular Monolith  

---

## 1. System Overview & Component Topology

JDP Flow Sensor Manager & Traffic Analyzer dirancang dengan arsitektur modular yang memisahkan bidang kontrol web (*Control Plane*), mesin penangkap dan pemrosesan paket flow (*Data Ingestion Plane*), serta mesin analitik waktu-nyata (*Analytics & Storage Plane*).

```mermaid
graph TB
    subgraph Network Routers & Exporters
        R1["Juniper MX / vMX<br/>(inline-jflow)"]
        R2["Huawei NE / CloudEngine<br/>(NetStream)"]
        R3["MikroTik CCR / RouterOS<br/>(Traffic Flow / IPFIX)"]
        R4["Cisco ASR / Catalyst<br/>(Flexible NetFlow)"]
    end

    subgraph Flow Ingestion Plane
        UDP["UDP Flow Listener<br/>Ports: 2055, 6343, 9995"]
        DECODER["Protocol Decoders<br/>(NetFlow v5/v9, IPFIX, sFlow)"]
        REGISTRY["Dynamic Exporter Registry<br/>(In-Memory Hash Map)"]
        REAPER["Stale Sensor Monitor<br/>(Heartbeat & State Evaluator)"]
    end

    subgraph Data & Storage Plane
        DB[("Application RDBMS<br/>SQLite / PostgreSQL<br/>(Devices, Sensors, RBAC, Logs)")]
        ANALYTICS[("Analytics Store<br/>Time-Series & Flow Mart<br/>(Pluggable In-Memory / ClickHouse)")]
        ENRICH[("ASN & BGP Radix Trie<br/>(IP-to-ASN, Org Directory)")]
    end

    subgraph Control Plane & Web API
        API["REST API & Backend Services<br/>(Next.js App Router API Handlers)"]
        AUTH["RBAC & Security Guard<br/>(Admin, NetEng, NOC, Analyst)"]
        PROV["Safe Provisioning Engine<br/>(Template Engine & Dry-run Gates)"]
        SNMP["SNMP Discovery Client<br/>(v2c / v3, Credential Vault)"]
    end

    subgraph Frontend User Experience
        WEB["Next.js Web UI (Dark Mode)<br/>• Device & Sensor Manager (PRTG Style)<br/>• Flow Explorer & Top Talkers<br/>• Multi-dimensional Sankey (Akvorado Style)<br/>• Config Generator & Audit Trail"]
    end

    %% Network flows
    R1 -- "UDP IPFIX / NetFlow" --> UDP
    R2 -- "UDP NetStream" --> UDP
    R3 -- "UDP IPFIX" --> UDP
    R4 -- "UDP NetFlow v9" --> UDP

    %% Ingestion flows
    UDP --> DECODER
    DECODER <--> REGISTRY
    REGISTRY --> REAPER
    REGISTRY -- "Update Status (Active, LastSeen)" --> DB
    DECODER -- "Raw Flow Records" --> ENRICH
    ENRICH -- "Enriched Flow Records" --> ANALYTICS

    %% Control plane connections
    API <--> DB
    API <--> ANALYTICS
    API -- "Sync Dynamic Sensors" --> REGISTRY
    PROV --> DB
    SNMP --> R1
    SNMP --> R2
    SNMP --> R3

    %% User Interactions
    WEB <--> AUTH
    AUTH <--> API
```

---

## 2. Dynamic Collector Registry (Zero-Config Architecture)

Salah satu masalah utama pada alat flow tradisional (seperti flow-tools, nfsen, atau pmacct) adalah keharusan menyunting berkas konfigurasi statis (`.cfg` / `.conf`) di server collector setiap kali perangkat baru didaftarkan.

Pada sistem ini, arsitektur **Dynamic Exporter Registry** diimplementasikan sebagai berikut:

```mermaid
sequenceDiagram
    autonumber
    actor Operator as NOC Operator
    participant UI as Web UI (Browser)
    participant API as Backend REST API
    participant DB as App Database
    participant Reg as In-Memory Registry
    participant UDP as UDP Listener
    actor Router as Network Router

    Operator->>UI: Submit "Add Flow Sensor" (IP: 192.168.1.1, Port: 2055, Proto: IPFIX)
    UI->>API: POST /api/devices/{id}/sensors
    API->>DB: INSERT INTO sensors (status: "Waiting for Flow", last_seen: NULL)
    API->>Reg: RegisterExporter(IP: 192.168.1.1, Port: 2055, SensorID)
    API-->>UI: 201 Created (Status: Waiting for Flow)

    Note over UI,Operator: Sensor berstatus "Waiting for Flow" (Kuning / Amber)

    Router->>UDP: Send UDP Flow Packet (SrcIP: 192.168.1.1:64512 -> Dst: 2055)
    UDP->>Reg: Lookup(SrcIP: 192.168.1.1, Port: 2055)
    Reg-->>UDP: Match Found -> SensorID: 42 (Current: Waiting for Flow)
    UDP->>DB: UPDATE sensors SET status="Active", last_flow_at=NOW() WHERE id=42
    Reg->>Reg: Update In-Memory Cache (Status: Active, LastSeen: NOW)
    UDP->>UDP: Parse Records & Send to Analytics Engine

    Note over UI,Operator: Polling / Refresh UI menampilkan status "Active" (Hijau / Emerald)
```

### Sensor State Machine
Status sensor diatur melalui siklus hidup yang ketat:
- **`Draft`**: Sensor baru disimpan oleh operator tapi belum diaktifkan.
- **`Waiting for Flow`**: Sensor aktif dalam registri collector, namun belum ada paket UDP valid yang diterima dari IP perangkat.
- **`Active`**: Paket flow valid diterima dan waktu kedatangan paket terakhir (`last_flow_at`) berada dalam rentang ambang toleransi (< `STALE_THRESHOLD_SECONDS`, default 180 detik).
- **`Stale`**: Sensor sebelumnya berstatus `Active`, namun tidak menerima paket baru selama lebih dari 180 detik. Status ini otomatis dievaluasi oleh background worker tanpa restart collector.
- **`Error`**: Ditemukan kesalahan parsing biner, malformed packet yang persisten, atau konflik konfigurasi.
- **`Disabled`**: Operator secara manual menonaktifkan sensor dari Web UI. Exporter dihapus dari active lookup table.

---

## 3. Database Schema & Data Models

Database metadata dirancang menggunakan model relasional yang ketat dan efisien.

```mermaid
erDiagram
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ PROVISIONING_JOBS : initiates
    DEVICES ||--o{ INTERFACES : contains
    DEVICES ||--o{ SENSORS : monitors
    DEVICES ||--o{ PROVISIONING_JOBS : targets
    SENSORS ||--o{ SENSOR_STATUS_HISTORY : tracks
    SENSORS ||--o{ FLOW_RECORDS : ingests

    USERS {
        string id PK
        string username UK
        string email UK
        string password_hash
        string role "admin | neteng | operator | analyst"
        datetime created_at
        datetime updated_at
    }

    DEVICES {
        string id PK
        string hostname UK
        string management_ip UK
        string vendor "juniper | huawei | mikrotik | cisco | nokia | zte | other"
        string model
        string role "core | edge | distribution | access | firewall | other"
        integer asn_number
        string asn_name
        string location_site
        string snmp_version "v2c | v3"
        integer snmp_port
        string snmp_community_encrypted
        string snmp_v3_user
        string snmp_v3_auth_proto
        string snmp_v3_auth_pass_encrypted
        string snmp_v3_priv_proto
        string snmp_v3_priv_pass_encrypted
        string status "active | unreachable | maintenance | disabled"
        string tags
        text notes
        datetime created_at
        datetime updated_at
    }

    INTERFACES {
        string id PK
        string device_id FK
        integer if_index
        string if_name
        string if_alias
        bigint if_speed
        string if_oper_status "up | down | testing"
        datetime last_discovered_at
    }

    SENSORS {
        string id PK
        string device_id FK
        string name
        string protocol "netflow_v5 | netflow_v9 | ipfix | sflow_v5"
        string collector_ip
        integer collector_port
        integer if_index
        integer sampling_rate
        string direction "ingress | egress | both"
        string status "draft | waiting_for_flow | active | stale | error | disabled"
        datetime last_flow_at
        bigint total_flows_received
        bigint total_bytes_received
        bigint total_packets_received
        string last_error_message
        datetime created_at
        datetime updated_at
    }

    SENSOR_STATUS_HISTORY {
        string id PK
        string sensor_id FK
        string old_status
        string new_status
        string trigger_reason
        datetime changed_at
    }

    ASN_DIRECTORY {
        integer asn PK
        string name
        string country
        string organization_type "tier1 | transit | content_cdn | eyeball_isp | enterprise"
        datetime updated_at
    }

    AUDIT_LOGS {
        string id PK
        string user_id FK
        string action "create | update | delete | test_snmp | provision_dryrun | provision_apply"
        string target_entity "device | sensor | system_setting"
        string target_id
        text diff_json
        string ip_address
        datetime created_at
    }

    PROVISIONING_JOBS {
        string id PK
        string device_id FK
        string requested_by FK
        string approved_by FK
        string vendor
        string mode "manual | dryrun | automatic"
        string status "pending_approval | approved | running | completed | failed | rolled_back"
        text generated_config
        text execution_log
        text rollback_config
        datetime created_at
        datetime executed_at
    }
```

---

## 4. Flow Ingestion & Decoding Engine

Modul penerima flow (`FlowCollectorService`) berjalan secara mandiri dan mendukung decoding paket biner berkecepatan tinggi:

### 4.1 Supported Wire Protocols
1. **NetFlow v5 (Fixed 24-byte Header):**
   - Header: Version (5), Count (1-30), SysUptime, UnixSecs, UnixNano, FlowSeq, EngineType, EngineID.
   - Record (48 bytes): `srcaddr`, `dstaddr`, `nexthop`, `input` (ifIndex), `output` (ifIndex), `dPkts`, `dOctets`, `First`, `Last`, `srcport`, `dstport`, `tcp_flags`, `prot`, `tos`, `src_as`, `dst_as`, `src_mask`, `dst_mask`.
2. **NetFlow v9 (RFC 3954) & IPFIX (RFC 7011):**
   - Mendukung FlowSet template dinamis dengan caching per IP exporter.
   - Ekstraksi field: Source IPv4/v6, Destination IPv4/v6, Source Transport Port, Destination Transport Port, Protocol ID, Ingress/Egress Interface, Packet Delta Count, Byte Delta Count, BGP Source ASN, BGP Destination ASN.
3. **sFlow v5 (RFC 3176):**
   - Parsing sample header flow (Ethernet, IPv4, IPv6, TCP/UDP headers) dan enterprise sample records.

### 4.2 Malformed Packet & Denial of Service Guard
- **Strict Byte Length Checking:** Setiap packet divalidasi panjang byte minimum sebelum di-slice untuk mencegah buffer overflow atau out-of-bounds exceptions.
- **Parser Isolation:** Setiap paket flow di-parse di dalam block `try-catch` terisolasi. Paket korup/malformed dicatat ke metrics error tanpa menyebabkan listener socket crash atau drop koneksi exporter lain.

---

## 5. ASN Enrichment & Interactive Sankey Engine

### 5.1 Enrichment Pipeline
Aliran paket flow sering kali hanya membawa Source IP dan Destination IP (atau ASN 0 jika router BGP exporter tidak menginjeksi AS paths). Pipeline pengayaan data bekerja secara bertingkat:

```mermaid
flowchart TD
    RAW["Raw Flow Record<br/>(Src IP, Dst IP, Src AS, Dst AS)"] --> CHECK_AS{"Is BGP AS valid<br/>in packet (> 0)?"}
    
    CHECK_AS -- "Yes" --> AS_SRC_OK["Use Packet Source ASN"]
    CHECK_AS -- "No / 0" --> TRIE_SRC["Lookup Src IP in Prefix Radix Trie"]
    
    TRIE_SRC --> RESOLVE_NAME["Lookup ASN Name in ASN Directory<br/>(e.g. AS15169 -> 'Google LLC')"]
    AS_SRC_OK --> RESOLVE_NAME

    RESOLVE_NAME --> CHECK_RFC1918{"Is IP Private<br/>(RFC 1918 / Bogon)?"}
    CHECK_RFC1918 -- "Yes" --> MARK_PRIVATE["Tag as 'Private / Internal Network'"]
    CHECK_RFC1918 -- "No" --> KEEP_ASN["Keep Enriched ASN & Org Name"]

    MARK_PRIVATE --> SINK["Stream to Analytics Store"]
    KEEP_ASN --> SINK
```

### 5.2 Sankey Aggregation Query Pattern
Untuk menjaga responsivitas browser (< 300 ms) saat me-render diagram Sankey dengan ribuan flow:
1. Backend melakukan agregasi database:
   ```sql
   SELECT 
     src_asn, src_asn_name,
     dst_asn, dst_asn_name,
     SUM(bytes) as total_bytes,
     SUM(packets) as total_packets,
     (SUM(bytes) * 8 / time_window_seconds) as bps
   FROM flow_records
   WHERE timestamp >= :start_time AND timestamp <= :end_time
     AND (:device_id IS NULL OR device_id = :device_id)
   GROUP BY src_asn, src_asn_name, dst_asn, dst_asn_name
   ORDER BY total_bytes DESC
   LIMIT 30;
   ```
2. Aliran kecil di luar Top 30 otomatis digabungkan (*grouped*) menjadi node virtual `"Other ASNs"` untuk mencegah diagram Sankey menjadi *spaghetti links*.
3. D3-Sankey SVG me-render node kiri (Source ASN), node kanan (Destination ASN / Customer Groups), dan link dengan atribut:
   - Stroke width proporsional terhadap `bps`.
   - Hover highlight pada path aliran.
   - Interactive Tooltip: menampilkan Source ASN Name, Dest ASN Name, Volume (bps & Bytes), Share percentage, dan Flow count.
   - Click node untuk langsung trigger drilldown ke tabular Flow Explorer.

---

## 6. Vendor Config Generator & Controlled Provisioning

### 6.1 Multi-Vendor Exporter Adapters
Sistem menyediakan adapter konfigurasi untuk 5 vendor router jaringan yang paling banyak digunakan di ISP Indonesia:

1. **Juniper Junos (MX / PTX / vMX):**
   ```text
   set services flow-monitoring version9 template IPv4-TEMPLATE ipv4-template
   set forwarding-options sampling instance FLOW-SAMPLING family inet output flow-server {{collector_ip}} port {{collector_port}}
   set forwarding-options sampling instance FLOW-SAMPLING family inet output flow-server {{collector_ip}} version9 template IPv4-TEMPLATE
   set forwarding-options sampling instance FLOW-SAMPLING family inet output inline-jflow source-address {{management_ip}}
   set interfaces {{interface_name}} unit 0 family inet sampling input
   ```
2. **Huawei VRP (NE40E / NetEngine / S-Series):**
   ```text
   ip netstream export host {{collector_ip}} {{collector_port}}
   ip netstream export source {{management_ip}}
   ip netstream export version 9
   ip netstream sampler fix-packets {{sampling_rate}} inbound
   interface {{interface_name}}
    ip netstream inbound
   ```
3. **MikroTik RouterOS (RouterOS v7 / CCR):**
   ```text
   /ip traffic-flow set enabled=yes interfaces={{interface_name}} cache-entries=128k active-flow-timeout=1m inactive-flow-timeout=15s
   /ip traffic-flow target add dst-address={{collector_ip}} port={{collector_port}} version=ipfix
   ```
4. **Cisco IOS-XE / IOS-XR:**
   ```text
   flow exporter EXP-JDP
    destination {{collector_ip}}
    source {{management_ip}}
    transport udp {{collector_port}}
   flow monitor MON-JDP
    exporter EXP-JDP
    cache timeout active 60
   interface {{interface_name}}
    ip flow monitor MON-JDP input
   ```
5. **Nokia SR OS (7750 SR):**
   ```text
   configure cflowd active-flow-timeout 1
   configure cflowd collector {{collector_ip}}:{{collector_port}} version 9
   configure router interface "{{interface_name}}" cflowd interface-plus
   ```

### 6.2 Security & Safety Guardrails
- **Manual Mode as Default:** Fitur generator menghasilkan script CLI yang dapat ditinjau dan disalin oleh network engineer.
- **Safe Automatic Provisioning (Opt-In):**
  - Menggunakan environment variable `ENABLE_LIVE_PROVISIONING=false` secara default.
  - Wajib melewati langkah `Dry-Run`: menampilkan syntax check dan parameter diff.
  - Memerlukan approval dari pengguna ber-role `Admin` dengan token konfirmasi.
  - Setiap eksekusi dibatasi timeout ketat (10 detik) dan mencatat seluruh output ke tabel `audit_logs` dan `provisioning_jobs`.
  - Dilengkapi generator rollback script otomatis untuk mengembalikan konfigurasi semula jika terjadi error koneksi atau timeout.

---

## 7. Security, RBAC & Protection Model

1. **Role-Based Access Control (RBAC):**
   - **`Admin`**: Akses penuh, manajemen user, approval provisioning live, konfigurasi sistem.
   - **`Network Engineer`**: Menambah/mengubah device & sensor, generate config, trigger dry-run provisioning.
   - **`NOC Operator`**: Melihat status real-time, membuat draft sensor/device, memantau alert stale.
   - **`Read-only Analyst`**: Akses analitik trafik, Top Talkers, dan diagram Sankey.
2. **Secret Management:**
   - Komunitas SNMP dan password credential disimpan terenkripsi dengan algoritma AES-256-GCM.
   - API serialization layer secara otomatis melakukan masking / omitting pada field rahasia.
   - Password atau secret token tidak pernah dituliskan ke dalam log berkas atau console trace.
3. **SSRF & Network Boundary Protection:**
   - Management IP untuk SNMP test dan provisioning divalidasi terhadap daftar blokir (e.g. `127.0.0.1`, `localhost`, link-local `169.254.0.0/16`, cloud metadata `169.254.169.254`).
   - Port koneksi dibatasi pada port standar manajemen jaringan.

