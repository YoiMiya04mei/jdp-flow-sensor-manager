import type { IProtocolParser, ParseResult, RawFlowRecord } from "../types";
import { checkBounds, readIPv4, readIPv6, readVariableUInt } from "./buffer-utils";

export interface IpfixField {
  elementId: number;
  length: number;
  enterpriseNumber?: number;
}

export interface IpfixTemplate {
  templateId: number;
  fieldCount: number;
  fields: IpfixField[];
  totalLength: number;
  receivedAt: number;
}

export class IpfixParser implements IProtocolParser {
  readonly protocol = "ipfix" as const;

  // Template cache keyed by `${exporterIp}:${observationDomainId}:${templateId}`
  private templateCache: Map<string, IpfixTemplate> = new Map();
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
    if (packet.length < 16) return false;
    return packet.readUInt16BE(0) === 10;
  }

  public parse(packet: Buffer, exporterIp: string, _exporterPort: number): ParseResult {
    if (!checkBounds(packet, 0, 16)) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `IPFIX packet too short: ${packet.length} bytes (minimum 16 bytes header required)`,
      };
    }

    const version = packet.readUInt16BE(0);
    if (version !== 10) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Invalid IPFIX version header: expected 10, got ${version}`,
      };
    }

    const messageLength = packet.readUInt16BE(2);
    if (packet.length < messageLength) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Truncated IPFIX packet: length ${packet.length} bytes, header specifies ${messageLength} bytes`,
      };
    }

    const exportTime = packet.readUInt32BE(4);
    const sequenceNumber = packet.readUInt32BE(8);
    const observationDomainId = packet.readUInt32BE(12);

    const exportTimeMs = exportTime * 1000;
    const records: RawFlowRecord[] = [];
    let offset = 16;
    let missingTemplateCount = 0;

    while (offset + 4 <= messageLength) {
      const setId = packet.readUInt16BE(offset);
      const setLength = packet.readUInt16BE(offset + 2);

      if (setLength < 4 || offset + setLength > messageLength) {
        break; // Set header malformed
      }

      if (setId === 2) {
        // --- TEMPLATE SET ---
        let tmplOffset = offset + 4;
        const setEnd = offset + setLength;

        while (tmplOffset + 4 <= setEnd) {
          const templateId = packet.readUInt16BE(tmplOffset);
          const fieldCount = packet.readUInt16BE(tmplOffset + 2);
          tmplOffset += 4;

          const fields: IpfixField[] = [];
          let totalLength = 0;

          for (let f = 0; f < fieldCount; f++) {
            if (tmplOffset + 4 > setEnd) break;
            const rawElementId = packet.readUInt16BE(tmplOffset);
            const fieldLength = packet.readUInt16BE(tmplOffset + 2);
            tmplOffset += 4;

            const isEnterprise = (rawElementId & 0x8000) !== 0;
            const elementId = rawElementId & 0x7fff;
            let enterpriseNumber: number | undefined;

            if (isEnterprise) {
              if (tmplOffset + 4 <= setEnd) {
                enterpriseNumber = packet.readUInt32BE(tmplOffset);
                tmplOffset += 4;
              }
            }

            fields.push({ elementId, length: fieldLength, enterpriseNumber });
            totalLength += fieldLength;
          }

          if (fields.length === fieldCount && totalLength > 0) {
            // Evict if cache exceeds max size
            if (this.templateCache.size >= this.maxCacheSize) {
              const oldestKey = this.templateCache.keys().next().value;
              if (oldestKey) this.templateCache.delete(oldestKey);
            }

            const cacheKey = `${exporterIp}:${observationDomainId}:${templateId}`;
            this.templateCache.set(cacheKey, {
              templateId,
              fieldCount,
              fields,
              totalLength,
              receivedAt: Date.now(),
            });
          }
        }
      } else if (setId === 3) {
        // --- OPTIONS TEMPLATE SET (safely skipped / handled) ---
      } else if (setId > 255) {
        // --- DATA SET ---
        const templateId = setId;
        const cacheKey = `${exporterIp}:${observationDomainId}:${templateId}`;
        const template = this.templateCache.get(cacheKey);

        if (!template) {
          missingTemplateCount++;
        } else {
          // Check for TTL expiration
          if (Date.now() - template.receivedAt > this.templateTtlMs) {
            this.templateCache.delete(cacheKey);
            missingTemplateCount++;
          } else {
            let dataOffset = offset + 4;
            const setEnd = offset + setLength;

            while (dataOffset + template.totalLength <= setEnd) {
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
              let flowStartMs: number | null = null;
              let flowEndMs: number | null = null;

              for (const field of template.fields) {
                switch (field.elementId) {
                  case 1: // octetDeltaCount
                    byteCount = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 2: // packetDeltaCount
                    packetCount = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 4: // protocolIdentifier
                    ipProtocol = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 6: // tcpControlBits
                    tcpFlags = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 7: // sourceTransportPort
                    srcPort = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 8: // sourceIPv4Address
                    srcIp = readIPv4(packet, dataOffset);
                    ipVersion = 4;
                    break;
                  case 10: // ingressInterface
                    inIfIndex = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 11: // destinationIPv4Address
                    dstIp = readIPv4(packet, dataOffset);
                    ipVersion = 4;
                    break;
                  case 12: // destinationTransportPort
                    dstPort = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 14: // egressInterface
                    outIfIndex = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 16: // bgpSourceAsNumber
                    srcAsn = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 17: // bgpDestinationAsNumber
                    dstAsn = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 27: // sourceIPv6Address
                    srcIp = readIPv6(packet, dataOffset);
                    ipVersion = 6;
                    break;
                  case 28: // destinationIPv6Address
                    dstIp = readIPv6(packet, dataOffset);
                    ipVersion = 6;
                    break;
                  case 34: // samplingInterval
                    samplingRate = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 150: // flowStartSeconds
                    flowStartMs = readVariableUInt(packet, dataOffset, field.length) * 1000;
                    break;
                  case 151: // flowEndSeconds
                    flowEndMs = readVariableUInt(packet, dataOffset, field.length) * 1000;
                    break;
                  case 152: // flowStartMilliseconds
                    flowStartMs = readVariableUInt(packet, dataOffset, field.length);
                    break;
                  case 153: // flowEndMilliseconds
                    flowEndMs = readVariableUInt(packet, dataOffset, field.length);
                    break;
                }
                dataOffset += field.length;
              }

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
                flowStartMs: flowStartMs ?? exportTimeMs,
                flowEndMs: flowEndMs ?? exportTimeMs,
                rawDataLength: template.totalLength,
              });
            }
          }
        }
      }

      offset += setLength;
    }

    return {
      success: true,
      protocol: this.protocol,
      records,
      header: {
        version,
        messageLength,
        exportTime,
        sequenceNumber,
        observationDomainId,
        missingTemplateCount,
      },
      error:
        missingTemplateCount > 0 && records.length === 0
          ? `Waiting for IPFIX template (unrecognized template ID)`
          : undefined,
    };
  }
}

