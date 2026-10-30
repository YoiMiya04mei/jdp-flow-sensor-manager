import type { FlowProtocol } from "@/types";

export interface NormalizedFlowRecord {
  id: string;
  timestamp: number; // millisecond timestamp of the flow event
  receivedAt: string; // ISO-8601 string when collector ingested the packet
  exporterIp: string;
  exporterPort: number;
  collectorPort: number;
  sensorId: string | null;
  deviceId: string | null;
  protocol: FlowProtocol;
  ipVersion: 4 | 6;
  srcIp: string;
  dstIp: string;
  srcPort: number | null;
  dstPort: number | null;
  ipProtocol: number; // 6 (TCP), 17 (UDP), 1 (ICMP), 58 (ICMPv6), etc.
  tcpFlags: number | null;
  inIfIndex: number | null;
  outIfIndex: number | null;
  packetCount: number;
  byteCount: number;
  samplingRate: number;
  samplingAdjustedPackets: number;
  samplingAdjustedBytes: number;
  srcAsn: number | null;
  dstAsn: number | null;
  completeness: "complete" | "partial";
}

export type FlowSortColumn =
  | "timestamp"
  | "byteCount"
  | "packetCount"
  | "samplingAdjustedBytes"
  | "srcIp"
  | "dstIp"
  | "srcPort"
  | "dstPort";

export type FlowSortOrder = "asc" | "desc";

export interface FlowQueryParams {
  startTime?: number;
  endTime?: number;
  search?: string;
  sensorId?: string;
  deviceId?: string;
  exporterIp?: string;
  srcIp?: string;
  dstIp?: string;
  srcAsn?: number;
  dstAsn?: number;
  ipVersion?: 4 | 6;
  ipProtocol?: number;
  port?: number;
  srcPort?: number;
  dstPort?: number;
  inIfIndex?: number;
  outIfIndex?: number;
  protocol?: FlowProtocol;
  sortBy?: FlowSortColumn;
  sortOrder?: FlowSortOrder;
  limit?: number;
  offset?: number;
}

export interface FlowQueryResult {
  records: NormalizedFlowRecord[];
  total: number;
  totalBytes: number;
  totalPackets: number;
  totalAdjustedBytes: number;
  totalAdjustedPackets: number;
}

export interface TimeSeriesBucket {
  timestamp: number; // bucket start epoch ms
  timeLabel: string;
  bytes: number; // raw byte count
  packets: number; // raw packet count
  adjustedBytes: number; // sampling-adjusted byte estimate
  adjustedPackets: number; // sampling-adjusted packet estimate
  bps: number; // bits per second
  pps: number; // packets per second
  flowCount: number;
}

export interface TrafficOverviewMetrics {
  totalBytes: number;
  totalPackets: number;
  totalAdjustedBytes: number;
  totalAdjustedPackets: number;
  totalFlows: number;
  estimatedBps: number;
  estimatedPps: number;
  activeExportersCount: number;
  activeSensorsCount: number;
  timeRangeStart: number;
  timeRangeEnd: number;
  durationSeconds: number;
}

export interface TopTalkerEntry {
  key: string;
  label: string;
  bytes: number;
  packets: number;
  adjustedBytes: number;
  adjustedPackets: number;
  flowCount: number;
  percentage: number;
}

export interface TopTalkersResult {
  topSourceIps: TopTalkerEntry[];
  topDestinationIps: TopTalkerEntry[];
  topConversations: TopTalkerEntry[];
  topPorts: TopTalkerEntry[];
  topProtocols: TopTalkerEntry[];
  ipVersionDistribution: {
    ipv4Bytes: number;
    ipv6Bytes: number;
    ipv4Percent: number;
    ipv6Percent: number;
  };
}

export interface AnalyticsStoreStats {
  totalRecordsStored: number;
  maxCapacity: number;
  oldestRecordTimestamp: number | null;
  newestRecordTimestamp: number | null;
  storageEngine: "in-memory" | "clickhouse" | "sqlite";
  retentionDescription: string;
}

export interface IAnalyticsStore {
  readonly engine: "in-memory" | "clickhouse" | "sqlite";
  insertBatch(records: NormalizedFlowRecord[]): Promise<void>;
  query(params?: FlowQueryParams): Promise<FlowQueryResult>;
  getAll(params?: FlowQueryParams): Promise<NormalizedFlowRecord[]>;
  getStats(): AnalyticsStoreStats;
  clear(): void;
}
