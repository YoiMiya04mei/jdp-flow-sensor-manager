import type { IProtocolParser, ParseResult, RawFlowRecord } from "../types";
import { checkBounds, readIPv4 } from "./buffer-utils";

export class NetFlowV5Parser implements IProtocolParser {
  readonly protocol = "netflow_v5" as const;

  public canParse(packet: Buffer): boolean {
    if (packet.length < 24) return false;
    return packet.readUInt16BE(0) === 5;
  }

  public parse(packet: Buffer, _exporterIp: string, _exporterPort: number): ParseResult {
    if (!checkBounds(packet, 0, 24)) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `NetFlow v5 packet too short: ${packet.length} bytes (minimum 24 bytes header required)`,
      };
    }

    const version = packet.readUInt16BE(0);
    if (version !== 5) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Invalid NetFlow v5 version header: expected 5, got ${version}`,
      };
    }

    const count = packet.readUInt16BE(2);
    if (count < 1 || count > 30) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Invalid NetFlow v5 record count: ${count} (expected 1 to 30)`,
      };
    }

    const expectedLength = 24 + count * 48;
    if (packet.length < expectedLength) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Truncated NetFlow v5 packet: length ${packet.length} bytes, expected at least ${expectedLength} bytes for ${count} records`,
      };
    }

    const sysUptime = packet.readUInt32BE(4);
    const unixSecs = packet.readUInt32BE(8);
    const unixNsecs = packet.readUInt32BE(12);
    const flowSeq = packet.readUInt32BE(16);
    const engineType = packet.readUInt8(20);
    const engineId = packet.readUInt8(21);
    const samplingRaw = packet.readUInt16BE(22);
    // Lower 14 bits represent sampling interval
    const samplingInterval = samplingRaw & 0x3fff;
    const samplingRate = samplingInterval > 0 ? samplingInterval : 1;

    const exportTimeMs = unixSecs * 1000 + Math.floor(unixNsecs / 1_000_000);

    const records: RawFlowRecord[] = [];
    let offset = 24;

    for (let i = 0; i < count; i++) {
      const srcIp = readIPv4(packet, offset + 0);
      const dstIp = readIPv4(packet, offset + 4);
      // const nextHop = readIPv4(packet, offset + 8);
      const inIfIndex = packet.readUInt16BE(offset + 12);
      const outIfIndex = packet.readUInt16BE(offset + 14);
      const packetCount = packet.readUInt32BE(offset + 16);
      const byteCount = packet.readUInt32BE(offset + 20);
      const firstSwitched = packet.readUInt32BE(offset + 24);
      const lastSwitched = packet.readUInt32BE(offset + 28);
      const srcPort = packet.readUInt16BE(offset + 32);
      const dstPort = packet.readUInt16BE(offset + 34);
      const tcpFlags = packet.readUInt8(offset + 37);
      const ipProtocol = packet.readUInt8(offset + 38);
      // const tos = packet.readUInt8(offset + 39);
      const srcAs = packet.readUInt16BE(offset + 40);
      const dstAs = packet.readUInt16BE(offset + 42);

      // Calculate approximate flow time based on router uptime & export time
      const flowStartMs = exportTimeMs - (sysUptime - firstSwitched);
      const flowEndMs = exportTimeMs - (sysUptime - lastSwitched);

      records.push({
        srcIp,
        dstIp,
        ipVersion: 4,
        srcPort,
        dstPort,
        ipProtocol,
        tcpFlags,
        inIfIndex,
        outIfIndex,
        packetCount,
        byteCount,
        samplingRate,
        srcAsn: srcAs > 0 ? srcAs : null,
        dstAsn: dstAs > 0 ? dstAs : null,
        flowStartMs: flowStartMs > 0 ? flowStartMs : exportTimeMs,
        flowEndMs: flowEndMs > 0 ? flowEndMs : exportTimeMs,
        rawDataLength: 48,
      });

      offset += 48;
    }

    return {
      success: true,
      protocol: this.protocol,
      records,
      header: {
        version,
        count,
        sysUptime,
        unixSecs,
        flowSeq,
        engineType,
        engineId,
        samplingRate,
      },
    };
  }
}

