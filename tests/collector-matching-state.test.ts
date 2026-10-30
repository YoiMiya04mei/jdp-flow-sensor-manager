import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { db } from "../src/server/db";
import { users, devices, interfaces, sensors, sensorStatusHistory } from "../src/server/db/schema";
import { sensorRegistry } from "../src/server/sensors/sensor-registry";
import { normalizeFlowRecords } from "../src/server/collector/normalizer";
import { FlowCollectorService } from "../src/server/collector/flow-collector-service";
import { analyticsStore } from "../src/server/analytics/analytics-store";
import { buildNetFlowV5Packet } from "./fixtures/flow-packets";
import { eq } from "drizzle-orm";
import crypto from "crypto";

describe("Phase 4: Collector Matching & State Machine Integration", () => {
  const testDeviceId = "dev-matching-001";
  const testExporterIp = "10.200.1.1";
  const testSensorId1 = "sensor-if10";
  const testSensorId2 = "sensor-global";
  const testDisabledSensorId = "sensor-disabled";

  beforeAll(async () => {
    // Clean and seed device and interfaces
    await db.delete(sensorStatusHistory);
    await db.delete(sensors);
    await db.delete(interfaces);
    await db.delete(devices);

    const now = new Date().toISOString();

    // 1. Create Device
    await db.insert(devices).values({
      id: testDeviceId,
      hostname: "cr01.jdp.net",
      managementIp: testExporterIp,
      vendor: "juniper",
      model: "MX204",
      role: "core",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 2. Create Interface
    await db.insert(interfaces).values({
      id: "if-10",
      deviceId: testDeviceId,
      ifIndex: 10,
      ifName: "xe-0/0/0",
      ifAlias: "Uplink to Telkom",
      lastDiscoveredAt: now,
    });

    // 3. Create Sensor 1: Bound to ifIndex 10 (ingress/both)
    await db.insert(sensors).values({
      id: testSensorId1,
      deviceId: testDeviceId,
      name: "MX204 Uplink Ingress",
      protocol: "netflow_v5",
      collectorIp: "0.0.0.0",
      collectorPort: 2055,
      ifIndex: 10,
      samplingRate: 1000,
      direction: "ingress",
      status: "waiting_for_flow",
      totalFlowsReceived: 0,
      totalBytesReceived: 0,
      totalPacketsReceived: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create Sensor 2: Global Router-wide (ifIndex null)
    await db.insert(sensors).values({
      id: testSensorId2,
      deviceId: testDeviceId,
      name: "MX204 Global NetFlow",
      protocol: "netflow_v5",
      collectorIp: "0.0.0.0",
      collectorPort: 2055,
      ifIndex: null,
      samplingRate: 1000,
      direction: "both",
      status: "waiting_for_flow",
      totalFlowsReceived: 0,
      totalBytesReceived: 0,
      totalPacketsReceived: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Create Sensor 3: Disabled sensor (should NEVER become active)
    await db.insert(sensors).values({
      id: testDisabledSensorId,
      deviceId: testDeviceId,
      name: "MX204 Disabled Sensor",
      protocol: "netflow_v5",
      collectorIp: "0.0.0.0",
      collectorPort: 2055,
      ifIndex: 20,
      samplingRate: 1000,
      direction: "both",
      status: "disabled",
      totalFlowsReceived: 0,
      totalBytesReceived: 0,
      totalPacketsReceived: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  beforeEach(async () => {
    analyticsStore.clear();
    await sensorRegistry.syncFromDatabase();
  });

  it("synchronizes active sensors from database into memory table", async () => {
    const activeSensors = sensorRegistry.getActiveSensors();
    // Only enabled sensors (2 active, disabled sensor excluded)
    expect(activeSensors.length).toBe(2);
    expect(activeSensors.some((s) => s.id === testSensorId1)).toBe(true);
    expect(activeSensors.some((s) => s.id === testSensorId2)).toBe(true);
    expect(activeSensors.some((s) => s.id === testDisabledSensorId)).toBe(false);
  });

  it("matches specific interface first before falling back to router-wide sensor", () => {
    // 1. Packet on ifIndex 10 -> Matches Sensor 1
    const match1 = sensorRegistry.matchFlowRecord({
      exporterIp: testExporterIp,
      collectorPort: 2055,
      protocol: "netflow_v5",
      inIfIndex: 10,
    });
    expect(match1.sensor?.id).toBe(testSensorId1);
    expect(match1.deviceId).toBe(testDeviceId);
    expect(match1.isKnownExporter).toBe(true);

    // 2. Packet on ifIndex 99 (unconfigured ifIndex) -> Falls back to global Sensor 2
    const match2 = sensorRegistry.matchFlowRecord({
      exporterIp: testExporterIp,
      collectorPort: 2055,
      protocol: "netflow_v5",
      inIfIndex: 99,
    });
    expect(match2.sensor?.id).toBe(testSensorId2);

    // 3. Packet from unknown exporter IP -> sensor is null, isKnownExporter is false
    const matchUnknown = sensorRegistry.matchFlowRecord({
      exporterIp: "192.0.2.1",
      collectorPort: 2055,
      protocol: "netflow_v5",
      inIfIndex: 10,
    });
    expect(matchUnknown.sensor).toBeNull();
    expect(matchUnknown.isKnownExporter).toBe(false);
  });

  it("calculates sampling-adjusted byte and packet estimates during normalization", () => {
    const raw = [
      {
        srcIp: "10.1.1.1",
        dstIp: "10.2.2.2",
        ipVersion: 4 as const,
        srcPort: 1234,
        dstPort: 80,
        ipProtocol: 6,
        tcpFlags: 0x18,
        inIfIndex: 10,
        outIfIndex: 20,
        packetCount: 15,
        byteCount: 15000,
        samplingRate: null, // Should take sensor's sampling rate = 1000
        srcAsn: null,
        dstAsn: null,
        flowStartMs: Date.now() - 5000,
        flowEndMs: Date.now(),
      },
    ];

    const norm = normalizeFlowRecords(raw, testExporterIp, 50000, 2055, "netflow_v5");
    expect(norm.matchedFlows).toBe(1);
    expect(norm.records[0].sensorId).toBe(testSensorId1);
    expect(norm.records[0].samplingRate).toBe(1000);
    // Adjusted = 15000 * 1000 = 15,000,000 bytes
    expect(norm.records[0].samplingAdjustedBytes).toBe(15_000_000);
    expect(norm.records[0].samplingAdjustedPackets).toBe(15_000);
  });

  it("transitions sensor state from 'waiting_for_flow' to 'active' on valid packet ingestion", async () => {
    const collector = new FlowCollectorService({
      host: "127.0.0.1",
      ports: [12055],
    });

    // Create a valid NetFlow v5 packet for ifIndex 10
    const packet = buildNetFlowV5Packet([
      {
        inIfIndex: 10,
        packets: 10,
        bytes: 12000,
      },
    ]);

    // Handle datagram directly via pipeline
    collector.handleDatagram(packet, { address: testExporterIp, port: 51234 }, 2055);

    // Verify in-memory state transition
    const activeSensors = sensorRegistry.getActiveSensors();
    const sensor1 = activeSensors.find((s) => s.id === testSensorId1);
    expect(sensor1?.status).toBe("active");

    // Flush metrics to DB
    await collector.flushSensorMetrics();

    // Verify DB update
    const [dbSensor] = await db
      .select()
      .from(sensors)
      .where(eq(sensors.id, testSensorId1))
      .limit(1);
    expect(dbSensor.status).toBe("active");
    expect(dbSensor.lastFlowAt).not.toBeNull();
    expect(dbSensor.totalFlowsReceived).toBe(1);
    expect(dbSensor.totalPacketsReceived).toBe(10);
    expect(dbSensor.totalBytesReceived).toBe(12000);

    // Verify status transition history record
    const history = await db
      .select()
      .from(sensorStatusHistory)
      .where(eq(sensorStatusHistory.sensorId, testSensorId1));
    expect(history.length).toBeGreaterThan(0);
    const lastHistory = history[history.length - 1];
    expect(lastHistory.oldStatus).toBe("waiting_for_flow");
    expect(lastHistory.newStatus).toBe("active");
    expect(lastHistory.triggerReason).toContain("First valid flow received");
  });

  it("never activates a disabled sensor even when matching traffic arrives", async () => {
    const collector = new FlowCollectorService();

    // Send packet matching disabled sensor (ifIndex 20)
    const packet = buildNetFlowV5Packet([
      {
        inIfIndex: 20,
        packets: 5,
        bytes: 4000,
      },
    ]);

    collector.handleDatagram(packet, { address: testExporterIp, port: 51234 }, 2055);

    const [disabledSensor] = await db
      .select()
      .from(sensors)
      .where(eq(sensors.id, testDisabledSensorId))
      .limit(1);
    // Must remain disabled!
    expect(disabledSensor.status).toBe("disabled");
    expect(disabledSensor.totalFlowsReceived).toBe(0);
  });

  it("does not activate any sensors on malformed packets or unknown exporter", async () => {
    const collector = new FlowCollectorService();
    collector.resetTelemetry();

    // 1. Malformed packet
    const malformed = Buffer.from([0x00, 0x05, 0x00]); // Cut in half
    collector.handleDatagram(malformed, { address: testExporterIp, port: 51234 }, 2055);

    const telemetry = collector.getTelemetry();
    expect(telemetry.packetsMalformed).toBe(1);
    expect(telemetry.flowsMatched).toBe(0);

    // 2. Unknown Exporter
    const unknownPacket = buildNetFlowV5Packet();
    collector.handleDatagram(unknownPacket, { address: "198.51.100.99", port: 51234 }, 2055);

    const telemetry2 = collector.getTelemetry();
    expect(telemetry2.unknownExporters).toBe(1);
  });

  it("detects stale sensors when no flow is received within timeout", async () => {
    // Sensor 1 is active, simulate lastFlowAt 5 minutes ago
    const pastTime = new Date(Date.now() - 300_000).toISOString();
    await db
      .update(sensors)
      .set({
        status: "active",
        lastFlowAt: pastTime,
      })
      .where(eq(sensors.id, testSensorId1));

    await sensorRegistry.syncFromDatabase();

    // Create collector with stale timeout = 60s
    const collector = new FlowCollectorService({
      staleTimeoutSeconds: 60,
    });

    const staledCount = await collector.checkStaleSensors();
    expect(staledCount).toBe(1);

    const [dbSensor] = await db
      .select()
      .from(sensors)
      .where(eq(sensors.id, testSensorId1))
      .limit(1);
    expect(dbSensor.status).toBe("stale");

    // History record for stale transition
    const history = await db
      .select()
      .from(sensorStatusHistory)
      .where(eq(sensorStatusHistory.sensorId, testSensorId1));
    const staleEntry = history.find((h) => h.newStatus === "stale");
    expect(staleEntry).toBeDefined();
    expect(staleEntry?.triggerReason).toContain("No flow received for >60s");
  });
});

