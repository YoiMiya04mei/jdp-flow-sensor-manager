import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dgram from "node:dgram";
import { db } from "@/server/db";
import { devices, interfaces, sensors, sensorStatusHistory, users, provisioningJobs } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { FlowCollectorService } from "@/server/collector/flow-collector-service";
import { sensorRegistry } from "@/server/sensors/sensor-registry";
import { analyticsStore } from "@/server/analytics/analytics-store";
import { asnEnrichmentService } from "@/server/asn/asn-enrichment-service";
import { provisioningService } from "@/server/provisioning/provisioning-service";
import { encryptSecret, redactDeviceSecrets } from "@/server/auth/crypto";
import type { SessionUser } from "@/types";
import { eq } from "drizzle-orm";

describe("Phase 8: Comprehensive End-to-End Workflow Verification", () => {
  const E2E_PORT = 13055;
  const E2E_HOST = "127.0.0.1";
  const E2E_DEV_ID = `dev-e2e-${Date.now()}`;
  const E2E_IF_ID = `if-e2e-${Date.now()}`;
  const E2E_SNS_ID = `sns-e2e-${Date.now()}`;

  const netengUser: SessionUser = {
    id: "usr-e2e-neteng",
    username: "e2e_neteng",
    email: "e2e_neteng@jdp-noc.internal",
    role: "neteng",
  };

  const adminUser: SessionUser = {
    id: "usr-e2e-admin",
    username: "e2e_admin",
    email: "e2e_admin@jdp-noc.internal",
    role: "admin",
  };

  const operatorUser: SessionUser = {
    id: "usr-e2e-operator",
    username: "e2e_operator",
    email: "e2e_operator@jdp-noc.internal",
    role: "operator",
  };

  let collector: FlowCollectorService;
  let senderSocket: dgram.Socket;

  beforeAll(async () => {
    await runMigrations();

    // Ensure users exist
    for (const u of [adminUser, netengUser, operatorUser]) {
      const [existing] = await db.select().from(users).where(eq(users.id, u.id));
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

    // Initialize ASN directories & tries
    await asnEnrichmentService.initialize();

    // Start isolated collector on E2E port
    collector = new FlowCollectorService({
      host: E2E_HOST,
      ports: [E2E_PORT],
      staleTimeoutSeconds: 5,
      flushIntervalMs: 200,
    });
    await collector.start();

    senderSocket = dgram.createSocket("udp4");
  });

  afterAll(async () => {
    senderSocket.close();
    await collector.stop();

    // Clean up test records
    await db.delete(sensors).where(eq(sensors.id, E2E_SNS_ID));
    await db.delete(interfaces).where(eq(interfaces.id, E2E_IF_ID));
    await db.delete(devices).where(eq(devices.id, E2E_DEV_ID));
  });

  describe("A. Device Onboarding & Credential Security", () => {
    it("onboards router with encrypted SNMP community and redacts secrets", async () => {
      const community = "SecretNocCommunity2026!";
      const encryptedCommunity = encryptSecret(community);

      const now = new Date().toISOString();
      await db.insert(devices).values({
        id: E2E_DEV_ID,
        hostname: `pe-router-e2e.jdp.noc`,
        managementIp: E2E_HOST,
        vendor: "juniper",
        model: "MX204",
        role: "edge",
        asnNumber: 136052,
        asnName: "PT Jala Lintas Media",
        snmpVersion: "v2c",
        snmpCommunityEncrypted: encryptedCommunity,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const [storedDev] = await db.select().from(devices).where(eq(devices.id, E2E_DEV_ID));
      expect(storedDev).toBeDefined();
      expect(storedDev.hostname).toBe("pe-router-e2e.jdp.noc");
      // Plaintext secret must NEVER be stored
      expect(storedDev.snmpCommunityEncrypted).not.toBe(community);

      // Redaction utility removes encrypted secrets before API response
      const redacted = redactDeviceSecrets(storedDev);
      expect((redacted as any).snmpCommunityEncrypted).toBeUndefined();

      // Discovered Interface Attachment
      await db.insert(interfaces).values({
        id: E2E_IF_ID,
        deviceId: E2E_DEV_ID,
        ifIndex: 1,
        ifName: "ge-0/0/0",
        ifAlias: "Transit Upstream Telkom",
        ifSpeed: 1000000000,
        ifOperStatus: "up",
        lastDiscoveredAt: now,
      });
    });
  });

  describe("B. Flow Sensor Provisioning & Dynamic Registry Sync", () => {
    it("creates flow sensor in initial 'waiting_for_flow' state and registers with zero restart", async () => {
      const now = new Date().toISOString();
      await db.insert(sensors).values({
        id: E2E_SNS_ID,
        deviceId: E2E_DEV_ID,
        name: "E2E Edge NetFlow Sensor",
        protocol: "netflow_v5",
        collectorIp: E2E_HOST,
        collectorPort: E2E_PORT,
        ifIndex: 1,
        samplingRate: 1000,
        direction: "both",
        status: "waiting_for_flow",
        createdAt: now,
        updatedAt: now,
      });

      // Synchronize registry without collector restart
      await sensorRegistry.syncFromDatabase();

      const match = sensorRegistry.matchFlowRecord({
        exporterIp: E2E_HOST,
        collectorPort: E2E_PORT,
        protocol: "netflow_v5",
        inIfIndex: 1,
      });

      expect(match.isKnownExporter).toBe(true);
      expect(match.sensor).not.toBeNull();
      expect(match.sensor?.status).toBe("waiting_for_flow");
    });
  });

  describe("C. UDP Flow Ingestion, Parser, and Normalization", () => {
    it("ingests binary NetFlow v5 datagram over UDP loopback socket and stores normalized flows", async () => {
      // Build 1 NetFlow v5 packet with 2 records
      const buf = Buffer.alloc(24 + 2 * 48);
      buf.writeUInt16BE(5, 0); // v5
      buf.writeUInt16BE(2, 2); // 2 records
      buf.writeUInt32BE(1000, 4);
      buf.writeUInt32BE(Math.floor(Date.now() / 1000), 8);
      buf.writeUInt32BE(0, 12);
      buf.writeUInt32BE(1, 16);
      buf.writeUInt16BE(1000, 22); // sampling interval = 1000

      // Record 1: 8.8.8.8 -> 103.10.20.5 (Bank Mandiri customer)
      buf.writeUInt8(8, 24);
      buf.writeUInt8(8, 25);
      buf.writeUInt8(8, 26);
      buf.writeUInt8(8, 27);
      buf.writeUInt8(103, 28);
      buf.writeUInt8(10, 29);
      buf.writeUInt8(20, 30);
      buf.writeUInt8(5, 31);
      buf.writeUInt16BE(1, 36); // in_ifIndex = 1 (matches sensor!)
      buf.writeUInt16BE(2, 38); // out_ifIndex = 2
      buf.writeUInt32BE(10, 40); // 10 packets
      buf.writeUInt32BE(15000, 44); // 15,000 bytes
      buf.writeUInt16BE(443, 56);
      buf.writeUInt16BE(54321, 58);
      buf.writeUInt8(6, 62); // TCP
      buf.writeUInt16BE(15169, 64); // AS15169 (Google)
      buf.writeUInt16BE(7713, 66); // AS7713 (Telkom)

      // Record 2: 1.1.1.1 -> 192.168.1.50 (Private IP)
      const off2 = 24 + 48;
      buf.writeUInt8(1, off2);
      buf.writeUInt8(1, off2 + 1);
      buf.writeUInt8(1, off2 + 2);
      buf.writeUInt8(1, off2 + 3);
      buf.writeUInt8(192, off2 + 4);
      buf.writeUInt8(168, off2 + 5);
      buf.writeUInt8(1, off2 + 6);
      buf.writeUInt8(50, off2 + 7);
      buf.writeUInt16BE(1, off2 + 12); // in_ifIndex = 1
      buf.writeUInt16BE(2, off2 + 14); // out_ifIndex = 2
      buf.writeUInt32BE(5, off2 + 16); // 5 packets
      buf.writeUInt32BE(8000, off2 + 20); // 8,000 bytes
      buf.writeUInt16BE(80, off2 + 32);
      buf.writeUInt16BE(52000, off2 + 34);
      buf.writeUInt8(6, off2 + 38);
      buf.writeUInt16BE(13335, off2 + 40); // AS13335 (Cloudflare)
      buf.writeUInt16BE(0, off2 + 42); // 0 -> private network destination

      // Send datagram via UDP
      await new Promise<void>((resolve) => {
        senderSocket.send(buf, 0, buf.length, E2E_PORT, E2E_HOST, () => resolve());
      });

      // Wait for ingestion pipeline processing
      await new Promise((r) => setTimeout(r, 600));

      const telemetry = collector.getTelemetry();
      expect(telemetry.packetsReceived).toBeGreaterThanOrEqual(1);
      expect(telemetry.packetsValid).toBeGreaterThanOrEqual(1);
      expect(telemetry.flowsParsed).toBeGreaterThanOrEqual(2);
      expect(telemetry.flowsMatched).toBeGreaterThanOrEqual(2);
    });

    it("rejects malformed datagrams without corrupting sensor or crashing listener", async () => {
      const corruptBuf = Buffer.alloc(10); // Too short for NetFlow v5
      corruptBuf.writeUInt16BE(5, 0);

      await new Promise<void>((resolve) => {
        senderSocket.send(corruptBuf, 0, corruptBuf.length, E2E_PORT, E2E_HOST, () => resolve());
      });

      await new Promise((r) => setTimeout(r, 300));
      const telemetry = collector.getTelemetry();
      expect(telemetry.packetsMalformed).toBeGreaterThanOrEqual(1);
    });
  });

  describe("D. Sensor Lifecycle & State Machine Transitions", () => {
    it("transitions sensor from 'waiting_for_flow' to 'active' on valid flow arrival", async () => {
      // Flush metrics so database reflects the state transition
      await collector.flushSensorMetrics();

      const [sensorRow] = await db.select().from(sensors).where(eq(sensors.id, E2E_SNS_ID));
      expect(sensorRow).toBeDefined();
      expect(sensorRow.status).toBe("active");
      expect(sensorRow.lastFlowAt).not.toBeNull();
      expect(sensorRow.totalBytesReceived).toBeGreaterThan(0);

      // Check transition history log
      const history = await db
        .select()
        .from(sensorStatusHistory)
        .where(eq(sensorStatusHistory.sensorId, E2E_SNS_ID));
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].oldStatus).toBe("waiting_for_flow");
      expect(history[0].newStatus).toBe("active");
    });
  });

  describe("E. Traffic Analytics, Top ASNs, and Sankey Visualization Pipeline", () => {
    it("queries ingested records with accurate sampling adjustment and filters", async () => {
      const result = await analyticsStore.query({
        sensorId: E2E_SNS_ID,
      });

      expect(result.total).toBeGreaterThanOrEqual(2);
      // Raw bytes != Sampling adjusted bytes
      expect(result.totalAdjustedBytes).toBe(result.totalBytes * 1000); // Sampling rate 1:1000

      // IP filter check
      const googleFilter = await analyticsStore.query({
        srcIp: "8.8.8.8",
      });
      expect(googleFilter.total).toBeGreaterThanOrEqual(1);
      expect(googleFilter.records[0].dstIp).toBe("103.10.20.5");
    });

    it("generates Top ASNs analytics and aggregates ASN share percentages", async () => {
      const topAsns = await asnEnrichmentService.getTopAsns({
        sensorId: E2E_SNS_ID,
      });

      expect(topAsns.topSourceAsns.length).toBeGreaterThanOrEqual(1);
      const googleAsn = topAsns.topSourceAsns.find((a) => a.asn === 15169);
      expect(googleAsn).toBeDefined();
      expect(googleAsn?.name).toContain("Google");
      expect(googleAsn?.percentage).toBeGreaterThan(0);
    });

    it("generates Interactive Sankey Diagram Graph for Mode A and Mode B", async () => {
      // Mode A: Source ASN -> Destination ASN
      const sankeyA = await asnEnrichmentService.getSankeyGraph(
        { sensorId: E2E_SNS_ID },
        { mode: "asn_to_asn", metric: "bytes" }
      );
      expect(sankeyA.nodes.length).toBeGreaterThanOrEqual(2);
      expect(sankeyA.links.length).toBeGreaterThanOrEqual(1);

      // Mode B: Source ASN -> Customer Network
      const sankeyB = await asnEnrichmentService.getSankeyGraph(
        { sensorId: E2E_SNS_ID },
        { mode: "asn_to_customer", metric: "bytes" }
      );
      expect(sankeyB.nodes.length).toBeGreaterThanOrEqual(2);
      const customerLink = sankeyB.links.find(
        (l) => l.target === "Corporate Client - Bank Mandiri"
      );
      expect(customerLink).toBeDefined();
    });
  });

  describe("F. Router Config Generator & Controlled Provisioning Flow", () => {
    let provJobId: string;

    it("generates CLI configuration from database records with SHA-256 snapshot hash", async () => {
      const job = await provisioningService.createConfiguration(
        {
          deviceId: E2E_DEV_ID,
          sensorIds: [E2E_SNS_ID],
          targetInterfaceNames: ["ge-0/0/0"],
          title: "E2E Junos Exporter Provisioning",
        },
        operatorUser
      );

      expect(job.status).toBe("validated");
      expect(job.vendor).toBe("juniper");
      expect(job.generatedConfig).toContain("set services flow-monitoring");
      expect(job.configHash).toHaveLength(64);
      provJobId = job.id;
    });

    it("submits for approval, enforces anti-self-approval, and verifies dual-approval", async () => {
      // 1. Submit
      await provisioningService.submitForApproval(provJobId, operatorUser);
      let job = (await provisioningService.getJobById(provJobId))!;
      expect(job.status).toBe("pending_approval");

      // 2. Anti-Self-Approval
      await expect(
        provisioningService.approveOrReject(provJobId, "approve", operatorUser)
      ).rejects.toThrow();

      // 3. Approval by NetEng
      job = await provisioningService.approveOrReject(
        provJobId,
        "approve",
        netengUser,
        "Verified interface ge-0/0/0"
      );
      expect(job.status).toBe("approved");
      expect(job.approvedBy).toBe(netengUser.id);
    });

    it("executes safe Dry-Run and validates Default-Deny guardrail for live execution", async () => {
      // Dry-Run succeeds safely
      const dryRun = await provisioningService.executeDryRun(provJobId, netengUser);
      expect(dryRun.success).toBe(true);
      expect(dryRun.log).toContain("[SIMULATED_MOCK_ADAPTER] DRY-RUN SUCCESSFUL");

      // Live Execution rejected because ROUTER_LIVE_EXECUTION_ENABLED is false
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "false";
      await expect(
        provisioningService.executeLive(provJobId, netengUser)
      ).rejects.toThrow(/Live router provisioning is disabled by default/);
    });

    it("locks mock adapter from live execution and applies only when physical driver is enabled", async () => {
      // Enable live execution & allowlist, but keep mock adapter
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "true";
      process.env.ROUTER_PROVISIONING_ENABLED = "true";
      process.env.ROUTER_ALLOWLIST = E2E_HOST;
      delete process.env.ROUTER_PHYSICAL_DRIVER_ENABLED;
      delete process.env.ROUTER_ADAPTER_TYPE;

      // Mock adapter must reject live execution
      await expect(
        provisioningService.executeLive(provJobId, adminUser)
      ).rejects.toThrow(/Physical router driver is not installed \(mock adapter active\)/);

      // Now enable physical driver for verified lab/staging execution
      process.env.ROUTER_PHYSICAL_DRIVER_ENABLED = "true";
      process.env.ROUTER_ADAPTER_TYPE = "physical";

      const liveResult = await provisioningService.executeLive(provJobId, adminUser);
      expect(liveResult.success).toBe(true);
      expect(liveResult.status).toBe("applied");

      // Rollback
      const rbResult = await provisioningService.executeRollback(provJobId, adminUser);
      expect(rbResult.success).toBe(true);
      const rolledBackJob = (await provisioningService.getJobById(provJobId))!;
      expect(rolledBackJob.status).toBe("rolled_back");

      // Restore default-off security
      process.env.ROUTER_LIVE_EXECUTION_ENABLED = "false";
      process.env.ROUTER_PROVISIONING_ENABLED = "false";
      delete process.env.ROUTER_PHYSICAL_DRIVER_ENABLED;
      delete process.env.ROUTER_ADAPTER_TYPE;
    });
  });
});
