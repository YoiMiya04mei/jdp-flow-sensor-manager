import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { analyticsStore } from "../src/server/analytics/analytics-store";
import { TrafficQueryService } from "../src/server/analytics/traffic-query-service";
import type { NormalizedFlowRecord } from "../src/server/analytics/types";
import { db } from "../src/server/db";
import { devices, sensors, users } from "../src/server/db/schema";
import crypto from "crypto";

describe("Phase 5: Traffic Analytics & Flow Explorer", () => {
  const baseTime = 1700000000000; // Fixed epoch timestamp for deterministic tests

  // Helper to generate normalized records with explicit test fixture labeling
  function makeTestRecord(overrides: Partial<NormalizedFlowRecord> = {}): NormalizedFlowRecord {
    const rawBytes = overrides.byteCount ?? 1000;
    const samplingRate = overrides.samplingRate ?? 1000;
    return {
      id: crypto.randomUUID(),
      timestamp: overrides.timestamp ?? baseTime,
      receivedAt: new Date(overrides.timestamp ?? baseTime).toISOString(),
      exporterIp: overrides.exporterIp ?? "10.0.0.1",
      exporterPort: 2055,
      collectorPort: 2055,
      sensorId: overrides.sensorId ?? "sensor-test-01",
      deviceId: overrides.deviceId ?? "device-test-01",
      protocol: overrides.protocol ?? "netflow_v5",
      ipVersion: overrides.ipVersion ?? 4,
      srcIp: overrides.srcIp ?? "192.168.1.10",
      dstIp: overrides.dstIp ?? "8.8.8.8",
      srcPort: overrides.srcPort !== undefined ? overrides.srcPort : 45000,
      dstPort: overrides.dstPort !== undefined ? overrides.dstPort : 53,
      ipProtocol: overrides.ipProtocol ?? 17, // UDP
      tcpFlags: overrides.tcpFlags ?? null,
      inIfIndex: overrides.inIfIndex ?? 10,
      outIfIndex: overrides.outIfIndex ?? 20,
      packetCount: overrides.packetCount ?? 5,
      byteCount: rawBytes,
      samplingRate,
      samplingAdjustedPackets: (overrides.packetCount ?? 5) * samplingRate,
      samplingAdjustedBytes: rawBytes * samplingRate,
      srcAsn: overrides.srcAsn !== undefined ? overrides.srcAsn : 15169,
      dstAsn: overrides.dstAsn !== undefined ? overrides.dstAsn : null,
      completeness: "complete",
    };
  }

  beforeAll(async () => {
    // Setup test device and sensor in DB for enriched join tests
    await db.delete(sensors);
    await db.delete(devices);
    const now = new Date().toISOString();

    await db.insert(devices).values({
      id: "device-test-01",
      hostname: "edge01.jdp.net",
      managementIp: "10.0.0.1",
      vendor: "juniper",
      model: "MX204",
      role: "edge",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(sensors).values({
      id: "sensor-test-01",
      deviceId: "device-test-01",
      name: "Edge Uplink Sensor",
      protocol: "netflow_v5",
      collectorIp: "0.0.0.0",
      collectorPort: 2055,
      ifIndex: 10,
      samplingRate: 1000,
      direction: "both",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  });

  beforeEach(() => {
    analyticsStore.clear();
  });

  describe("Query & Filtering Engine", () => {
    it("filters records accurately by time range, IP, protocol, and ports", async () => {
      await analyticsStore.insertBatch([
        makeTestRecord({
          timestamp: baseTime + 1000,
          srcIp: "10.0.0.5",
          dstIp: "1.1.1.1",
          srcPort: 32000,
          dstPort: 443,
          ipProtocol: 6,
          byteCount: 2000,
        }),
        makeTestRecord({
          timestamp: baseTime + 5000,
          srcIp: "10.0.0.6",
          dstIp: "8.8.8.8",
          srcPort: 53000,
          dstPort: 53,
          ipProtocol: 17,
          byteCount: 500,
        }),
        makeTestRecord({
          timestamp: baseTime + 20000,
          srcIp: "2001:db8::1",
          dstIp: "2001:db8::2",
          ipVersion: 6,
          srcPort: 54321,
          dstPort: 80,
          ipProtocol: 6,
          byteCount: 8000,
        }),
      ]);

      // 1. Time range filter
      const resTime = await analyticsStore.query({
        startTime: baseTime,
        endTime: baseTime + 6000,
      });
      expect(resTime.total).toBe(2);

      // 2. IP search filter
      const resIp = await analyticsStore.query({ srcIp: "10.0.0.5" });
      expect(resIp.total).toBe(1);
      expect(resIp.records[0].dstIp).toBe("1.1.1.1");

      // 3. Port filter (matches either srcPort or dstPort)
      const resPort = await analyticsStore.query({ port: 53 });
      expect(resPort.total).toBe(1);
      expect(resPort.records[0].srcIp).toBe("10.0.0.6");

      // 4. IP version filter
      const resV6 = await analyticsStore.query({ ipVersion: 6 });
      expect(resV6.total).toBe(1);
      expect(resV6.records[0].srcIp).toBe("2001:db8::1");
    });

    it("supports sorting and pagination with bounds checking", async () => {
      const records = [];
      for (let i = 1; i <= 25; i++) {
        records.push(
          makeTestRecord({
            timestamp: baseTime + i * 100,
            byteCount: i * 100,
            packetCount: i,
          })
        );
      }
      await analyticsStore.insertBatch(records);

      // Sort by byteCount desc, limit 5, offset 0
      const page1 = await analyticsStore.query({
        sortBy: "byteCount",
        sortOrder: "desc",
        limit: 5,
        offset: 0,
      });
      expect(page1.total).toBe(25);
      expect(page1.records.length).toBe(5);
      expect(page1.records[0].byteCount).toBe(2500); // Highest
      expect(page1.records[4].byteCount).toBe(2100);

      // Page 2
      const page2 = await analyticsStore.query({
        sortBy: "byteCount",
        sortOrder: "desc",
        limit: 5,
        offset: 5,
      });
      expect(page2.records.length).toBe(5);
      expect(page2.records[0].byteCount).toBe(2000);
    });

    it("enriches records with router hostname, sensor name, and protocol name", async () => {
      await analyticsStore.insertBatch([
        makeTestRecord({
          deviceId: "device-test-01",
          sensorId: "sensor-test-01",
          ipProtocol: 6, // TCP
        }),
      ]);

      const result = await TrafficQueryService.queryFlowRecords();
      expect(result.records.length).toBe(1);
      expect(result.records[0].deviceHostname).toBe("edge01.jdp.net");
      expect(result.records[0].sensorName).toBe("Edge Uplink Sensor");
      expect(result.records[0].protocolName).toBe("TCP");
    });
  });

  describe("Calculations, Throughput & Rates", () => {
    it("distinguishes raw byte volume from sampling-adjusted volume", async () => {
      // 1 flow: 10,000 raw bytes, sampling rate = 1000
      await analyticsStore.insertBatch([
        makeTestRecord({
          byteCount: 10_000,
          packetCount: 10,
          samplingRate: 1000,
        }),
      ]);

      const res = await analyticsStore.query();
      expect(res.totalBytes).toBe(10_000); // Raw bytes
      expect(res.totalAdjustedBytes).toBe(10_000_000); // Adjusted bytes = 10MB
    });

    it("calculates estimated bps and pps correctly across duration window", async () => {
      // Duration window = 10 seconds (10,000 ms)
      const startTime = baseTime;
      const endTime = baseTime + 10_000;

      // Ingest 2 records:
      // Record 1: 10,000 bytes raw * 1000 = 10,000,000 bytes, 10 packets * 1000 = 10,000 packets
      // Record 2: 15,000 bytes raw * 1000 = 15,000,000 bytes, 20 packets * 1000 = 20,000 packets
      // Total Adjusted Bytes = 25,000,000 bytes (200,000,000 bits)
      // Total Adjusted Packets = 30,000 packets
      // Over 10s:
      // Estimated bps = 200,000,000 bits / 10s = 20,000,000 bps (20 Mbps)
      // Estimated pps = 30,000 pkts / 10s = 3,000 pps (3 Kpps)
      await analyticsStore.insertBatch([
        makeTestRecord({
          timestamp: baseTime + 2000,
          byteCount: 10_000,
          packetCount: 10,
          samplingRate: 1000,
        }),
        makeTestRecord({
          timestamp: baseTime + 7000,
          byteCount: 15_000,
          packetCount: 20,
          samplingRate: 1000,
        }),
      ]);

      const overview = await TrafficQueryService.getTrafficOverview({
        startTime,
        endTime,
      });

      expect(overview.totalBytes).toBe(25_000);
      expect(overview.totalAdjustedBytes).toBe(25_000_000);
      expect(overview.estimatedBps).toBe(20_000_000);
      expect(overview.estimatedPps).toBe(3000);
      expect(overview.activeExportersCount).toBe(1);
    });

    it("buckets time-series data and handles empty intervals without fake values", async () => {
      const startTime = baseTime;
      const endTime = baseTime + 40_000;
      const bucketIntervalMs = 10_000; // 4 buckets: 0-10s, 10-20s, 20-30s, 30-40s

      // Put record in bucket 0 (t=2s) and bucket 2 (t=25s). Buckets 1 and 3 are empty!
      await analyticsStore.insertBatch([
        makeTestRecord({
          timestamp: baseTime + 2000,
          byteCount: 5000,
          packetCount: 5,
          samplingRate: 1000,
        }),
        makeTestRecord({
          timestamp: baseTime + 25000,
          byteCount: 10000,
          packetCount: 10,
          samplingRate: 1000,
        }),
      ]);

      const buckets = await TrafficQueryService.getTimeSeries(
        { startTime, endTime },
        bucketIntervalMs
      );

      expect(buckets.length).toBe(4);

      // Bucket 0: Has flow
      expect(buckets[0].flowCount).toBe(1);
      expect(buckets[0].adjustedBytes).toBe(5_000_000);
      expect(buckets[0].bps).toBe(4_000_000); // 5MB * 8 / 10s = 4 Mbps

      // Bucket 1: Empty interval must strictly have 0 bps and 0 pps
      expect(buckets[1].flowCount).toBe(0);
      expect(buckets[1].bytes).toBe(0);
      expect(buckets[1].bps).toBe(0);
      expect(buckets[1].pps).toBe(0);

      // Bucket 2: Has flow
      expect(buckets[2].flowCount).toBe(1);
      expect(buckets[2].adjustedBytes).toBe(10_000_000);
      expect(buckets[2].bps).toBe(8_000_000); // 10MB * 8 / 10s = 8 Mbps

      // Bucket 3: Empty interval
      expect(buckets[3].flowCount).toBe(0);
      expect(buckets[3].bps).toBe(0);
    });
  });

  describe("Top Talkers Aggregations", () => {
    it("aggregates top source IPs, destination IPs, and port distributions", async () => {
      await analyticsStore.insertBatch([
        makeTestRecord({
          srcIp: "10.0.0.100",
          dstIp: "8.8.8.8",
          dstPort: 53,
          ipProtocol: 17,
          byteCount: 2000,
          samplingRate: 1000,
        }),
        makeTestRecord({
          srcIp: "10.0.0.100",
          dstIp: "1.1.1.1",
          dstPort: 443,
          ipProtocol: 6,
          byteCount: 8000,
          samplingRate: 1000,
        }),
        makeTestRecord({
          srcIp: "10.0.0.200",
          dstIp: "8.8.8.8",
          dstPort: 53,
          ipProtocol: 17,
          byteCount: 5000,
          samplingRate: 1000,
        }),
      ]);

      const topTalkers = await TrafficQueryService.getTopTalkers({}, 5);

      // Top Source IP: 10.0.0.100 (total adjusted = 10,000,000) > 10.0.0.200 (5,000,000)
      expect(topTalkers.topSourceIps.length).toBe(2);
      expect(topTalkers.topSourceIps[0].key).toBe("10.0.0.100");
      expect(topTalkers.topSourceIps[0].percentage).toBeGreaterThan(60);

      // Top Destination IP: 8.8.8.8 (7,000,000) vs 1.1.1.1 (8,000,000)
      expect(topTalkers.topDestinationIps[0].key).toBe("1.1.1.1");

      // Top Ports
      expect(topTalkers.topPorts.some((p) => p.key === "443")).toBe(true);
      expect(topTalkers.topPorts.some((p) => p.key === "53")).toBe(true);

      // IPv4 distribution: 100% IPv4
      expect(topTalkers.ipVersionDistribution.ipv4Percent).toBe(100);
      expect(topTalkers.ipVersionDistribution.ipv6Percent).toBe(0);
    });
  });

  describe("Ring Buffer Capacity & Eviction", () => {
    it("respects max capacity and performs FIFO eviction on buffer overflow", async () => {
      // Use small capacity for testing
      const testStore = new (analyticsStore.constructor as any)(5);

      const records = [];
      for (let i = 1; i <= 8; i++) {
        records.push(makeTestRecord({ byteCount: i * 10 }));
      }

      await testStore.insertBatch(records);

      const stats = testStore.getStats();
      expect(stats.totalRecordsStored).toBe(5); // Capped at maxCapacity

      // Oldest 3 (i=1, 2, 3) must be evicted, remaining 5 are i=4..8
      const res = await testStore.query({ sortOrder: "asc" });
      expect(res.records[0].byteCount).toBe(40);
      expect(res.records[4].byteCount).toBe(80);
    });
  });
});

