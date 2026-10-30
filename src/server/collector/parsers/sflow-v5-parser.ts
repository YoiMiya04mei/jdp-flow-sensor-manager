import type { IProtocolParser, ParseResult, RawFlowRecord } from "../types";
import { checkBounds, readIPv4, readIPv6 } from "./buffer-utils";

export class SFlowV5Parser implements IProtocolParser {
  readonly protocol = "sflow_v5" as const;

  public canParse(packet: Buffer): boolean {
    if (packet.length < 28) return false;
    // sFlow version 5 is a 32-bit integer: 0x00000005
    return packet.readUInt32BE(0) === 5;
  }

  public parse(packet: Buffer, _exporterIp: string, _exporterPort: number): ParseResult {
    if (!checkBounds(packet, 0, 28)) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `sFlow v5 packet too short: ${packet.length} bytes (minimum 28 bytes header required)`,
      };
    }

    const version = packet.readUInt32BE(0);
    if (version !== 5) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Invalid sFlow version header: expected 5, got ${version}`,
      };
    }

    const agentIpVersion = packet.readUInt32BE(4);
    let offset = 8;
    let agentIp = "0.0.0.0";

    if (agentIpVersion === 1) {
      // IPv4
      if (!checkBounds(packet, offset, 4)) {
        return {
          success: false,
          protocol: this.protocol,
          records: [],
          error: "Truncated sFlow v5 IPv4 agent address",
        };
      }
      agentIp = readIPv4(packet, offset);
      offset += 4;
    } else if (agentIpVersion === 2) {
      // IPv6
      if (!checkBounds(packet, offset, 16)) {
        return {
          success: false,
          protocol: this.protocol,
          records: [],
          error: "Truncated sFlow v5 IPv6 agent address",
        };
      }
      agentIp = readIPv6(packet, offset);
      offset += 16;
    } else {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: `Unsupported sFlow agent IP version: ${agentIpVersion}`,
      };
    }

    if (!checkBounds(packet, offset, 16)) {
      return {
        success: false,
        protocol: this.protocol,
        records: [],
        error: "Truncated sFlow v5 datagram header",
      };
    }

    const subAgentId = packet.readUInt32BE(offset);
    const sequenceNumber = packet.readUInt32BE(offset + 4);
    const sysUptime = packet.readUInt32BE(offset + 8);
    const numSamples = packet.readUInt32BE(offset + 12);
    offset += 16;

    const records: RawFlowRecord[] = [];
    let supportedSamples = 0;
    let unsupportedSamples = 0;

    for (let s = 0; s < numSamples; s++) {
      if (offset + 8 > packet.length) break;

      const rawSampleType = packet.readUInt32BE(offset);
      const sampleLength = packet.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + sampleLength > packet.length) break;

      const enterprise = rawSampleType >> 12;
      const format = rawSampleType & 0xfff;

      // Format 1: Flow Sample, Format 3: Expanded Flow Sample
      if (enterprise === 0 && (format === 1 || format === 3)) {
        supportedSamples++;
        const sampleStart = offset;
        const sampleEnd = offset + sampleLength;

        // Sequence number, source ID, sampling rate, sample pool, drops
        if (sampleStart + 24 <= sampleEnd) {
          // const sampleSeq = packet.readUInt32BE(sampleStart);
          // const sourceId = packet.readUInt32BE(sampleStart + 4);
          const samplingRate = packet.readUInt32BE(sampleStart + 8);
          // const samplePool = packet.readUInt32BE(sampleStart + 12);
          // const drops = packet.readUInt32BE(sampleStart + 16);
          const inputIf = packet.readUInt32BE(sampleStart + 20) & 0x3fffffff;
          let outputIf = 0;
          let numFlowRecords = 0;
          let recordOffset = sampleStart + 24;

          if (format === 1) {
            outputIf = packet.readUInt32BE(sampleStart + 24) & 0x3fffffff;
            numFlowRecords = packet.readUInt32BE(sampleStart + 28);
            recordOffset = sampleStart + 32;
          } else {
            // Expanded flow sample (format 3) has expanded interface tags
            outputIf = packet.readUInt32BE(sampleStart + 28) & 0x3fffffff;
            numFlowRecords = packet.readUInt32BE(sampleStart + 32);
            recordOffset = sampleStart + 36;
          }

          let sampleSrcIp = "0.0.0.0";
          let sampleDstIp = "0.0.0.0";
          let sampleIpVersion: 4 | 6 = 4;
          let sampleSrcPort: number | null = null;
          let sampleDstPort: number | null = null;
          let sampleIpProtocol = 0;
          let sampleTcpFlags: number | null = null;
          let sampleByteCount = 0;
          let sampleSrcAs: number | null = null;
          let sampleDstAs: number | null = null;
          let sampleFound = false;

          for (let r = 0; r < numFlowRecords; r++) {
            if (recordOffset + 8 > sampleEnd) break;
            const flowFormat = packet.readUInt32BE(recordOffset) & 0xfff;
            const flowLength = packet.readUInt32BE(recordOffset + 4);
            const flowDataStart = recordOffset + 8;
            recordOffset += 8 + ((flowLength + 3) & ~3); // XDR 4-byte align

            if (flowDataStart + flowLength > sampleEnd) break;

            if (flowFormat === 1) {
              // Raw Packet Header
              if (flowDataStart + 16 <= sampleEnd) {
                const headerProtocol = packet.readUInt32BE(flowDataStart);
                const frameLength = packet.readUInt32BE(flowDataStart + 4);
                // const stripped = packet.readUInt32BE(flowDataStart + 8);
                const headerSize = packet.readUInt32BE(flowDataStart + 12);
                const headerStart = flowDataStart + 16;

                sampleByteCount = frameLength;

                if (headerProtocol === 1 && headerStart + 14 <= sampleEnd && headerSize >= 14) {
                  // Ethernet Header
                  const etherType = packet.readUInt16BE(headerStart + 12);
                  const ipStart = headerStart + 14;

                  if (etherType === 0x0800 && ipStart + 20 <= sampleEnd) {
                    // IPv4 Header
                    const ihl = (packet.readUInt8(ipStart) & 0x0f) * 4;
                    sampleIpProtocol = packet.readUInt8(ipStart + 9);
                    sampleSrcIp = readIPv4(packet, ipStart + 12);
                    sampleDstIp = readIPv4(packet, ipStart + 16);
                    sampleIpVersion = 4;

                    const l4Start = ipStart + ihl;
                    if (l4Start + 4 <= sampleEnd) {
                      sampleSrcPort = packet.readUInt16BE(l4Start);
                      sampleDstPort = packet.readUInt16BE(l4Start + 2);
                      if (sampleIpProtocol === 6 && l4Start + 14 <= sampleEnd) {
                        sampleTcpFlags = packet.readUInt8(l4Start + 13);
                      }
                    }
                    sampleFound = true;
                  }
                }
              }
            } else if (flowFormat === 2) {
              // Sampled IPv4 Data
              if (flowDataStart + 32 <= sampleEnd) {
                sampleByteCount = packet.readUInt32BE(flowDataStart);
                sampleIpProtocol = packet.readUInt32BE(flowDataStart + 4);
                sampleSrcIp = readIPv4(packet, flowDataStart + 8);
                sampleDstIp = readIPv4(packet, flowDataStart + 12);
                sampleSrcPort = packet.readUInt32BE(flowDataStart + 16);
                sampleDstPort = packet.readUInt32BE(flowDataStart + 20);
                sampleTcpFlags = packet.readUInt32BE(flowDataStart + 24);
                sampleIpVersion = 4;
                sampleFound = true;
              }
            } else if (flowFormat === 1002) {
              // Extended Router Data
              if (flowDataStart + 24 <= sampleEnd) {
                sampleSrcAs = packet.readUInt32BE(flowDataStart + 16);
                sampleDstAs = packet.readUInt32BE(flowDataStart + 20);
              }
            }
          }

          if (sampleFound) {
            const now = Date.now();
            records.push({
              srcIp: sampleSrcIp,
              dstIp: sampleDstIp,
              ipVersion: sampleIpVersion,
              srcPort: sampleSrcPort,
              dstPort: sampleDstPort,
              ipProtocol: sampleIpProtocol,
              tcpFlags: sampleTcpFlags,
              inIfIndex: inputIf > 0 ? inputIf : null,
              outIfIndex: outputIf > 0 ? outputIf : null,
              packetCount: 1, // sFlow samples 1 individual packet per sample
              byteCount: sampleByteCount > 0 ? sampleByteCount : 1500,
              samplingRate: samplingRate > 0 ? samplingRate : 1000,
              srcAsn: sampleSrcAs && sampleSrcAs > 0 ? sampleSrcAs : null,
              dstAsn: sampleDstAs && sampleDstAs > 0 ? sampleDstAs : null,
              flowStartMs: now,
              flowEndMs: now,
              rawDataLength: sampleLength,
            });
          }
        }
      } else {
        // Counter Sample (Format 2 or 4) or unknown sample - safely accounted
        unsupportedSamples++;
      }

      // Move offset forward by padded sample length
      offset += (sampleLength + 3) & ~3;
    }

    return {
      success: true,
      protocol: this.protocol,
      records,
      header: {
        version,
        agentIp,
        subAgentId,
        sequenceNumber,
        sysUptime,
        numSamples,
        supportedSamples,
        unsupportedSamples,
      },
    };
  }
}

