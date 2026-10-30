import type { IProtocolParser, ParseResult, RawFlowRecord } from "../types";
import { checkBounds, readIPv4, readIPv6, readVariableUInt } from "./buffer-utils";

export interface TemplateField {
  type: number;
  length: number;
}

export interface V9Template {
  templateId: number;
  fieldCount: number;
  fields: TemplateField[];
  totalLength: number;
  receivedAt: number;
}

export class NetFlowV9Parser implements IProtocolParser {
  readonly protocol = "netflow_v9" as const;

  // Template cache keyed by `${exporterIp}:${sourceId}:${templateId}`
  private templateCache: Map<string, V9Template> = new Map();
  private maxCacheSize: number;
  private templateTtlMs: number;

  constructor(maxCacheSize: number = 2000, templateTtlMinutes: number = 60) {
    this.maxCacheSize = maxCacheSize;
    this.templateTtlMs = templateTtlMinutes * 60 * 1000;
  }

  public getCacheSize(): number {
    return this.templateCache.size;
  }

  public clearCache(): void {
    this.templateCache.clear();
  }

  public canParse(packet: Buffer): boolean {
    if (packet.length < 20) return false;
    return packet.readUInt16BE(0) === 9;
  }

  public parse(packet: Buffer, exporterIp: string, _exporterPort: number): ParseResult {
    if (!checkBounds(packet, 0, 20)) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `NetFlow v9 packet too short: ${packet.length} bytes (minimum 20 bytes header required)`,
      };
    }

    const version = packet.readUInt16BE(0);
    if (version !== 9) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Invalid NetFlow v9 version: expected 9, got ${version}`,
      };
    }

    const count = packet.readUInt16BE(2);
    const sysUptime = packet.readUInt32BE(4);
    const unixSecs = packet.readUInt32BE(8);
    const packageSeq = packet.readUInt32BE(12);
    const sourceId = packet.readUInt32BE(16);

    const exportTimeMs = unixSecs * 1000;
    const records: RawFlowRecord[] = [];
    let offset = 20;
    let flowSetsProcessed = 0;
    let missingTemplateCount = 0;

    while (offset + 4 <= packet.length && flowSetsProcessed < count) {
      const flowSetId = packet.readUInt16BE(offset);
      const flowSetLength = packet.readUInt16BE(offset + 2);

      if (flowSetLength < 4 || offset + flowSetLength > packet.length) {
        break; // FlowSet malformed or truncated
      }

      if (flowSetId === 0) {
        // --- TEMPLATE FLOWSET ---
        let tmplOffset = offset + 4;
        while (tmplOffset + 4 <= offset + flowSetLength) {
          const templateId = packet.readUInt16BE(tmplOffset);
          const fieldCount = packet.readUInt16BE(tmplOffset + 2);
          tmplOffset += 4;

          const fields: TemplateField[] = [];
          let totalLength = 0;

          for (let f = 0; f < fieldCount; f++) {
            if (tmplOffset + 4 > offset + flowSetLength) break;
            const fType = packet.readUInt16BE(tmplOffset);
            const fLen = packet.readUInt16BE(tmplOffset + 2);
            tmplOffset += 4;
            fields.push({ type: fType, length: fLen });
            totalLength += fLen;
          }

          if (fields.length === fieldCount && totalLength > 0) {
            // Evict if cache exceeds max size
            if (this.templateCache.size >= this.maxCacheSize) {
              const oldestKey = this.templateCache.keys().next().value;
              if (oldestKey) this.templateCache.delete(oldestKey);
            }

            const cacheKey = `${exporterIp}:${sourceId}:${templateId}`;
            this.templateCache.set(cacheKey, {
              templateId,
              fieldCount,
              fields,
              totalLength,
              receivedAt: Date.now(),
            });
          }
        }
      } else if (flowSetId === 1) {
        // --- OPTIONS TEMPLATE FLOWSET (skipped/handled safely) ---
        // Options templates define scope and options records
      } else if (flowSetId > 255) {
        // --- DATA FLOWSET ---
        const templateId = flowSetId;
        const cacheKey = `${exporterIp}:${sourceId}:${templateId}`;
        const template = this.templateCache.get(cacheKey);

        if (!template) {
          missingTemplateCount++;
        } else {
          // Check for template TTL expiration
          if (Date.now() - template.receivedAt > this.templateTtlMs) {
            this.templateCache.delete(cacheKey);
            missingTemplateCount++;
          } else {
            let dataOffset = offset + 4;
            const flowSetEnd = offset + flowSetLength;

            while (dataOffset + template.totalLength <= flowSetEnd) {
              let srcIp = "0.0.0.0";
              let dstIp = "0.0.0.0";
              let ipVersion: 4 | 6 = 4;
              let srcPort: number | null = null;
              let dstPort: number | null = null;
              let ipProtocol = 0;
              let tcpFlags: number | null = null;
              let inIfIndex: number | null = null;
              let outIfIndex: number | null = null;
              let packetCount = 0;
              let byteCount = 0;
              let srcAsn: number | null = null;
              let dstAsn: number | null = null;
              let samplingRate: number | null = null;
              let firstSwitched: number | null = null;
              let lastSwitched: number | null = null;

              for (const field of template.fields) {
                switch (field.type) {
                  case 1: // IN_BYTES
                    byteCount = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 2: // IN_PKTS
                    packetCount = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 4: // PROTOCOL
                    ipProtocol = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 6: // TCP_FLAGS
                    tcpFlags = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 7: // L4_SRC_PORT
                    srcPort = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 8: // IPV4_SRC_ADDR
                    srcIp = readIPv4(packet, dataOffset);
                    ipVersion = 4;
                    break;
                  case 10: // INPUT_SNMP
                    inIfIndex = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 11: // IPV4_DST_ADDR
                    dstIp = readIPv4(packet, dataOffset);
                    ipVersion = 4;
                    break;
                  case 12: // L4_DST_PORT
                    dstPort = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 14: // OUTPUT_SNMP
                    outIfIndex = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 16: // SRC_AS
                    srcAsn = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 17: // DST_AS
                    dstAsn = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 21: // LAST_SWITCHED
                    lastSwitched = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 22: // FIRST_SWITCHED
                    firstSwitched = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 27: // IPV6_SRC_ADDR
                    srcIp = readIPv6(packet, dataOffset);
                    ipVersion = 6;
                    break;
                  case 28: // IPV6_DST_ADDR
                    dstIp = readIPv6(packet, dataOffset);
                    ipVersion = 6;
                    break;
                  case 34: // SAMPLING_INTERVAL
                    samplingRate = readVariableUInt(packet, dataOffset, field.length);
                    break;
                }
                dataOffset += field.length;
              }

              const flowStartMs =
                firstSwitched !== null
                  ? exportTimeMs - (sysUptime - firstSwitched)
                  : exportTimeMs;
              const flowEndMs =
                lastSwitched !== null
                  ? exportTimeMs - (sysUptime - lastSwitched)
                  : exportTimeMs;

              records.push({
                srcIp,
                dstIp,
                ipVersion,
                srcPort,
                dstPort,
                ipProtocol,
                tcpFlags,
                inIfIndex,
                outIfIndex,
                packetCount,
                byteCount,
                samplingRate,
                srcAsn: srcAsn && srcAsn > 0 ? srcAsn : null,
                dstAsn: dstAsn && dstAsn > 0 ? dstAsn : null,
                flowStartMs: flowStartMs > 0 ? flowStartMs : exportTimeMs,
                flowEndMs: flowEndMs > 0 ? flowEndMs : exportTimeMs,
                rawDataLength: template.totalLength,
              });
            }
          }
        }
      }

      offset += flowSetLength;
      flowSetsProcessed++;
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
        packageSeq,
        sourceId,
        missingTemplateCount,
      },
      error:
        missingTemplateCount > 0 && records.length === 0
          ? `Waiting for NetFlow v9 template (unrecognized template ID)`
          : undefined,
    };
  }
}

