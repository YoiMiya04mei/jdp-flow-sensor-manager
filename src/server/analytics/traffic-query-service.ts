import { db } from "../db";
import { devices, sensors, interfaces } from "../db/schema";
import { analyticsStore } from "./analytics-store";
import type {
  FlowQueryParams,
  FlowQueryResult,
  TrafficOverviewMetrics,
  TimeSeriesBucket,
  TopTalkersResult,
  TopTalkerEntry,
  NormalizedFlowRecord,
} from "./types";

export interface EnrichedFlowRecord extends NormalizedFlowRecord {
  deviceHostname: string | null;
  sensorName: string | null;
  interfaceName: string | null;
  protocolName: string;
}

export interface EnrichedFlowQueryResult {
  records: EnrichedFlowRecord[];
  total: number;
  totalBytes: number;
  totalPackets: number;
  totalAdjustedBytes: number;
  totalAdjustedPackets: number;
}

const WELL_KNOWN_PORTS: Record<number, string> = {
  20: "FTP-Data",
  21: "FTP-Control",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  67: "DHCP-Server",
  68: "DHCP-Client",
  69: "TFTP",
  80: "HTTP",
  110: "POP3",
  123: "NTP",
  143: "IMAP",
  161: "SNMP",
  162: "SNMP-Trap",
  179: "BGP",
  443: "HTTPS",
  514: "Syslog",
  636: "LDAPS",
  853: "DNS-over-TLS",
  993: "IMAPS",
  995: "POP3S",
  2055: "NetFlow",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  6343: "sFlow",
  6379: "Redis",
  8080: "HTTP-Alt",
  8443: "HTTPS-Alt",
  9995: "Flow-Alt",
};

export function getProtocolName(ipProtocol: number): string {
  switch (ipProtocol) {
    case 1:
      return "ICMP";
    case 2:
      return "IGMP";
    case 6:
      return "TCP";
    case 17:
      return "UDP";
    case 41:
      return "IPv6-Encap";
    case 47:
      return "GRE";
    case 50:
      return "ESP";
    case 51:
      return "AH";
    case 58:
      return "ICMPv6";
    case 89:
      return "OSPF";
    case 132:
      return "SCTP";
    default:
      return `IP-${ipProtocol}`;
  }
}

export function resolveTimePreset(preset: string): {
  startTime: number;
  endTime: number;
  bucketIntervalMs: number;
} {
  const now = Date.now();
  switch (preset) {
    case "15m":
      return {
        startTime: now - 15 * 60 * 1000,
        endTime: now,
        bucketIntervalMs: 30 * 1000, // 30-second buckets
      };
    case "1h":
      return {
        startTime: now - 60 * 60 * 1000,
        endTime: now,
        bucketIntervalMs: 2 * 60 * 1000, // 2-minute buckets
      };
    case "6h":
      return {
        startTime: now - 6 * 3600 * 1000,
        endTime: now,
        bucketIntervalMs: 10 * 60 * 1000, // 10-minute buckets
      };
    case "24h":
      return {
        startTime: now - 24 * 3600 * 1000,
        endTime: now,
        bucketIntervalMs: 30 * 60 * 1000, // 30-minute buckets
      };
    case "7d":
      return {
        startTime: now - 7 * 86400 * 1000,
        endTime: now,
        bucketIntervalMs: 4 * 3600 * 1000, // 4-hour buckets
      };
    default:
      // Default to 1h
      return {
        startTime: now - 60 * 60 * 1000,
        endTime: now,
        bucketIntervalMs: 2 * 60 * 1000,
      };
  }
}

export class TrafficQueryService {
  /**
   * Enriched Flow Records Query with pagination, sorting, and metadata resolution.
   */
  public static async queryFlowRecords(
    params: FlowQueryParams = {}
  ): Promise<EnrichedFlowQueryResult> {
    const queryResult = await analyticsStore.query(params);

    if (queryResult.records.length === 0) {
      return {
        records: [],
        total: 0,
        totalBytes: 0,
        totalPackets: 0,
        totalAdjustedBytes: 0,
        totalAdjustedPackets: 0,
      };
    }

    // Resolve devices, sensors, and interfaces in a single batch
    const allDevices = await db.select().from(devices);
    const allSensors = await db.select().from(sensors);
    const allInterfaces = await db.select().from(interfaces);

    const deviceMap = new Map(allDevices.map((d) => [d.id, d.hostname]));
    const sensorMap = new Map(allSensors.map((s) => [s.id, s.name]));
    const ifaceMap = new Map<string, string>();
    for (const iface of allInterfaces) {
      ifaceMap.set(`${iface.deviceId}:${iface.ifIndex}`, iface.ifName);
    }

    const enrichedRecords: EnrichedFlowRecord[] = queryResult.records.map((r) => {
      const deviceHostname = r.deviceId ? deviceMap.get(r.deviceId) || null : null;
      const sensorName = r.sensorId ? sensorMap.get(r.sensorId) || null : null;
      let interfaceName = null;
      if (r.deviceId && r.inIfIndex) {
        interfaceName = ifaceMap.get(`${r.deviceId}:${r.inIfIndex}`) || `ifIndex ${r.inIfIndex}`;
      } else if (r.inIfIndex) {
        interfaceName = `ifIndex ${r.inIfIndex}`;
      }

      return {
        ...r,
        deviceHostname,
        sensorName,
        interfaceName,
        protocolName: getProtocolName(r.ipProtocol),
      };
    });

    return {
      records: enrichedRecords,
      total: queryResult.total,
      totalBytes: queryResult.totalBytes,
      totalPackets: queryResult.totalPackets,
      totalAdjustedBytes: queryResult.totalAdjustedBytes,
      totalAdjustedPackets: queryResult.totalAdjustedPackets,
    };
  }

  /**
   * Aggregated Traffic Overview Metrics.
   */
  public static async getTrafficOverview(
    params: FlowQueryParams = {}
  ): Promise<TrafficOverviewMetrics> {
    const records = await analyticsStore.getAll(params);

    const now = Date.now();
    const startTime = params.startTime ?? (now - 3600_000);
    const endTime = params.endTime ?? now;
    const durationSeconds = Math.max(1, (endTime - startTime) / 1000);

    let totalBytes = 0;
    let totalPackets = 0;
    let totalAdjustedBytes = 0;
    let totalAdjustedPackets = 0;
    const uniqueExporters = new Set<string>();
    const uniqueSensors = new Set<string>();

    for (const r of records) {
      totalBytes += r.byteCount;
      totalPackets += r.packetCount;
      totalAdjustedBytes += r.samplingAdjustedBytes;
      totalAdjustedPackets += r.samplingAdjustedPackets;
      if (r.exporterIp) uniqueExporters.add(r.exporterIp);
      if (r.sensorId) uniqueSensors.add(r.sensorId);
    }

    // bps = (adjustedBytes * 8) / durationSeconds
    const estimatedBps = Math.round((totalAdjustedBytes * 8) / durationSeconds);
    // pps = adjustedPackets / durationSeconds
    const estimatedPps = Math.round(totalAdjustedPackets / durationSeconds);

    return {
      totalBytes,
      totalPackets,
      totalAdjustedBytes,
      totalAdjustedPackets,
      totalFlows: records.length,
      estimatedBps,
      estimatedPps,
      activeExportersCount: uniqueExporters.size,
      activeSensorsCount: uniqueSensors.size,
      timeRangeStart: startTime,
      timeRangeEnd: endTime,
      durationSeconds,
    };
  }

  /**
   * Time-series bucketing for Traffic Charts (bps & pps).
   */
  public static async getTimeSeries(
    params: FlowQueryParams = {},
    customIntervalMs?: number
  ): Promise<TimeSeriesBucket[]> {
    const now = Date.now();
    const startTime = params.startTime ?? (now - 3600_000);
    const endTime = params.endTime ?? now;
    const totalDuration = Math.max(1, endTime - startTime);

    // Determine bucket interval (aim for 25 to 50 buckets)
    const bucketInterval =
      customIntervalMs && customIntervalMs > 0
        ? customIntervalMs
        : Math.max(5000, Math.floor(totalDuration / 30));

    const bucketCount = Math.ceil(totalDuration / bucketInterval);
    const buckets: TimeSeriesBucket[] = [];

    // Pre-allocate contiguous buckets to ensure empty time slots are accounted with 0 bps
    for (let i = 0; i < bucketCount; i++) {
      const bStart = startTime + i * bucketInterval;
      const d = new Date(bStart);
      const timeLabel =
        totalDuration > 86400_000
          ? `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      buckets.push({
        timestamp: bStart,
        timeLabel,
        bytes: 0,
        packets: 0,
        adjustedBytes: 0,
        adjustedPackets: 0,
        bps: 0,
        pps: 0,
        flowCount: 0,
      });
    }

    const records = await analyticsStore.getAll(params);

    const bucketSecs = bucketInterval / 1000;

    for (const r of records) {
      if (r.timestamp >= startTime && r.timestamp <= endTime) {
        const idx = Math.min(
          bucketCount - 1,
          Math.max(0, Math.floor((r.timestamp - startTime) / bucketInterval))
        );
        const b = buckets[idx];
        b.bytes += r.byteCount;
        b.packets += r.packetCount;
        b.adjustedBytes += r.samplingAdjustedBytes;
        b.adjustedPackets += r.samplingAdjustedPackets;
        b.flowCount += 1;
      }
    }

    // Calculate rates for each bucket
    for (const b of buckets) {
      b.bps = Math.round((b.adjustedBytes * 8) / bucketSecs);
      b.pps = Math.round(b.adjustedPackets / bucketSecs);
    }

    return buckets;
  }

  /**
   * Top Talkers Aggregations.
   */
  public static async getTopTalkers(
    params: FlowQueryParams = {},
    limit: number = 10
  ): Promise<TopTalkersResult> {
    const records = await analyticsStore.getAll(params);

    const totalAdjustedVolume = records.reduce(
      (sum, r) => sum + r.samplingAdjustedBytes,
      0
    );

    const srcMap = new Map<string, { bytes: number; packets: number; adjBytes: number; adjPkts: number; flows: number }>();
    const dstMap = new Map<string, { bytes: number; packets: number; adjBytes: number; adjPkts: number; flows: number }>();
    const convMap = new Map<string, { bytes: number; packets: number; adjBytes: number; adjPkts: number; flows: number }>();
    const portMap = new Map<string, { label: string; bytes: number; packets: number; adjBytes: number; adjPkts: number; flows: number }>();
    const protoMap = new Map<string, { label: string; bytes: number; packets: number; adjBytes: number; adjPkts: number; flows: number }>();

    let ipv4Bytes = 0;
    let ipv6Bytes = 0;

    for (const r of records) {
      if (r.ipVersion === 4) ipv4Bytes += r.samplingAdjustedBytes;
      if (r.ipVersion === 6) ipv6Bytes += r.samplingAdjustedBytes;

      // Source IP
      const s = srcMap.get(r.srcIp) || { bytes: 0, packets: 0, adjBytes: 0, adjPkts: 0, flows: 0 };
      s.bytes += r.byteCount;
      s.packets += r.packetCount;
      s.adjBytes += r.samplingAdjustedBytes;
      s.adjPkts += r.samplingAdjustedPackets;
      s.flows += 1;
      srcMap.set(r.srcIp, s);

      // Dest IP
      const d = dstMap.get(r.dstIp) || { bytes: 0, packets: 0, adjBytes: 0, adjPkts: 0, flows: 0 };
      d.bytes += r.byteCount;
      d.packets += r.packetCount;
      d.adjBytes += r.samplingAdjustedBytes;
      d.adjPkts += r.samplingAdjustedPackets;
      d.flows += 1;
      dstMap.set(r.dstIp, d);

      // Conversations (Pair)
      const pairKey = `${r.srcIp} ➔ ${r.dstIp}`;
      const c = convMap.get(pairKey) || { bytes: 0, packets: 0, adjBytes: 0, adjPkts: 0, flows: 0 };
      c.bytes += r.byteCount;
      c.packets += r.packetCount;
      c.adjBytes += r.samplingAdjustedBytes;
      c.adjPkts += r.samplingAdjustedPackets;
      c.flows += 1;
      convMap.set(pairKey, c);

      // Ports (prefer server/service port, usually dstPort for ingress)
      const servicePort = r.dstPort ?? r.srcPort;
      if (servicePort !== null && servicePort !== undefined) {
        const portKey = String(servicePort);
        const appName = WELL_KNOWN_PORTS[servicePort]
          ? `${servicePort} (${WELL_KNOWN_PORTS[servicePort]})`
          : `Port ${servicePort}`;

        const p = portMap.get(portKey) || { label: appName, bytes: 0, packets: 0, adjBytes: 0, adjPkts: 0, flows: 0 };
        p.bytes += r.byteCount;
        p.packets += r.packetCount;
        p.adjBytes += r.samplingAdjustedBytes;
        p.adjPkts += r.samplingAdjustedPackets;
        p.flows += 1;
        portMap.set(portKey, p);
      }

      // Protocols
      const protoKey = String(r.ipProtocol);
      const protoName = getProtocolName(r.ipProtocol);
      const pr = protoMap.get(protoKey) || { label: protoName, bytes: 0, packets: 0, adjBytes: 0, adjPkts: 0, flows: 0 };
      pr.bytes += r.byteCount;
      pr.packets += r.packetCount;
      pr.adjBytes += r.samplingAdjustedBytes;
      pr.adjPkts += r.samplingAdjustedPackets;
      pr.flows += 1;
      protoMap.set(protoKey, pr);
    }

    const toSortedTalkers = (
      entries: [string, { label?: string; bytes: number; packets: number; adjBytes: number; adjPkts: number; flows: number }][]
    ): TopTalkerEntry[] => {
      return entries
        .map(([key, data]) => ({
          key,
          label: data.label || key,
          bytes: data.bytes,
          packets: data.packets,
          adjustedBytes: data.adjBytes,
          adjustedPackets: data.adjPkts,
          flowCount: data.flows,
          percentage:
            totalAdjustedVolume > 0
              ? Math.min(100, Math.round((data.adjBytes / totalAdjustedVolume) * 1000) / 10)
              : 0,
        }))
        .sort((a, b) => b.adjustedBytes - a.adjustedBytes)
        .slice(0, limit);
    };

    const totalIpBytes = ipv4Bytes + ipv6Bytes;

    return {
      topSourceIps: toSortedTalkers(Array.from(srcMap.entries())),
      topDestinationIps: toSortedTalkers(Array.from(dstMap.entries())),
      topConversations: toSortedTalkers(Array.from(convMap.entries())),
      topPorts: toSortedTalkers(Array.from(portMap.entries())),
      topProtocols: toSortedTalkers(Array.from(protoMap.entries())),
      ipVersionDistribution: {
        ipv4Bytes,
        ipv6Bytes,
        ipv4Percent:
          totalIpBytes > 0
            ? Math.round((ipv4Bytes / totalIpBytes) * 1000) / 10
            : 100,
        ipv6Percent:
          totalIpBytes > 0
            ? Math.round((ipv6Bytes / totalIpBytes) * 1000) / 10
            : 0,
      },
    };
  }
}

