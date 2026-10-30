import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dgram from "node:dgram";
import { FlowCollectorService } from "../src/server/collector/flow-collector-service";
import { analyticsStore } from "../src/server/analytics/analytics-store";
import { buildNetFlowV5Packet } from "./fixtures/flow-packets";

describe("Phase 4: Real UDP Socket Collector Integration", () => {
  const testHost = "127.0.0.1";
  const testPort1 = 15055;
  const testPort2 = 15343;

  let collector: FlowCollectorService;

  beforeAll(async () => {
    analyticsStore.clear();
    collector = new FlowCollectorService({
      host: testHost,
      ports: [testPort1, testPort2],
      flushIntervalMs: 100,
    });
  });

  afterAll(async () => {
    if (collector) {
      await collector.stop();
    }
  });

  it("binds multiple UDP ports on localhost cleanly without errors", async () => {
    const statuses = await collector.start();

    expect(statuses.length).toBe(2);
    expect(statuses.every((s) => s.bound)).toBe(true);

    const telemetry = collector.getTelemetry();
    expect(telemetry.state).toBe("running");
    expect(telemetry.ports.length).toBe(2);
  });

  it("receives, parses, and persists a real binary NetFlow datagram sent via UDP", async () => {
    collector.resetTelemetry();
    analyticsStore.clear();

    const clientSocket = dgram.createSocket("udp4");

    const packet = buildNetFlowV5Packet([
      {
        srcIp: "10.100.5.1",
        dstIp: "10.200.5.2",
        srcPort: 32000,
        dstPort: 443,
        inIfIndex: 5,
        outIfIndex: 6,
        packets: 12,
        bytes: 14400,
        protocol: 6,
      },
    ]);

    // Send UDP packet over loopback
    await new Promise<void>((resolve, reject) => {
      clientSocket.send(packet, testPort1, testHost, (err) => {
        clientSocket.close();
        if (err) reject(err);
        else resolve();
      });
    });

    // Wait a moment for UDP loopback delivery and ingestion
    await new Promise((resolve) => setTimeout(resolve, 150));

    const telemetry = collector.getTelemetry();
    expect(telemetry.packetsReceived).toBeGreaterThanOrEqual(1);
    expect(telemetry.packetsValid).toBeGreaterThanOrEqual(1);
    expect(telemetry.flowsParsed).toBeGreaterThanOrEqual(1);

    // Verify analytics store contains the normalized record
    const queryRes = await analyticsStore.query({ srcIp: "10.100.5.1" });
    expect(queryRes.total).toBe(1);
    expect(queryRes.records[0].dstIp).toBe("10.200.5.2");
    expect(queryRes.records[0].byteCount).toBe(14400);
    expect(queryRes.records[0].packetCount).toBe(12);
    expect(queryRes.records[0].protocol).toBe("netflow_v5");
  });

  it("detects port bind collisions and reports real error without crashing", async () => {
    const conflictPort = 15999;
    const blockingSocket = dgram.createSocket("udp4");

    // Bind blocking socket first
    await new Promise<void>((resolve) => {
      blockingSocket.bind(conflictPort, testHost, () => resolve());
    });

    const conflictCollector = new FlowCollectorService({
      host: testHost,
      ports: [conflictPort],
    });

    const statuses = await conflictCollector.start();
    expect(statuses[0].bound).toBe(false);
    expect(statuses[0].error).toBeDefined();

    const telemetry = conflictCollector.getTelemetry();
    expect(telemetry.state).toBe("error");

    // Clean up
    await conflictCollector.stop();
    blockingSocket.close();
  });

  it("shuts down cleanly and releases all UDP ports", async () => {
    await collector.stop();
    const telemetry = collector.getTelemetry();
    expect(telemetry.state).toBe("stopped");
    expect(telemetry.ports.every((p) => !p.bound)).toBe(true);

    // Verify port is free by binding a new socket to it
    const testSocket = dgram.createSocket("udp4");
    const portRebound = await new Promise<boolean>((resolve) => {
      testSocket.bind(testPort1, testHost, () => {
        testSocket.close();
        resolve(true);
      });
      testSocket.on("error", () => {
        testSocket.close();
        resolve(false);
      });
    });

    expect(portRebound).toBe(true);
  });
});

