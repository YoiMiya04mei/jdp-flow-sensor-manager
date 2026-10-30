import type { FlowProtocol } from "@/types";

export interface RawFlowRecord {
  srcIp: string;
  dstIp: string;
  ipVersion: 4 | 6;
  srcPort: number | null;
  dstPort: number | null;
  ipProtocol: number; // 6 = TCP, 17 = UDP, 1 = ICMP, 58 = ICMPv6
  tcpFlags: number | null;
  inIfIndex: number | null;
  outIfIndex: number | null;
  packetCount: number;
  byteCount: number;
  samplingRate: number | null;
  srcAsn: number | null;
  dstAsn: number | null;
  flowStartMs: number | null;
  flowEndMs: number | null;
  rawDataLength?: number;
}

export interface ParseResult {
  success: boolean;
  protocol: FlowProtocol;
  records: RawFlowRecord[];
  error?: string;
  header?: Record<string, unknown>;
}

export interface IProtocolParser {
  readonly protocol: FlowProtocol;
  canParse(packet: Buffer): boolean;
  parse(packet: Buffer, exporterIp: string, exporterPort: number): ParseResult;
}

export interface PortBindStatus {
  port: number;
  bound: boolean;
  error?: string;
}

export interface CollectorTelemetry {
  state: "stopped" | "starting" | "running" | "error";
  listenHost: string;
  ports: PortBindStatus[];
  packetsReceived: number;
  packetsValid: number;
  packetsMalformed: number;
  packetsUnsupported: number;
  flowsParsed: number;
  flowsMatched: number;
  unknownExporters: number;
  parseErrorsByProtocol: Record<FlowProtocol, number>;
  templateCacheStats: {
    netflowV9Count: number;
    ipfixCount: number;
  };
  lastPacketReceivedAt: string | null;
  startedAt: string | null;
}

