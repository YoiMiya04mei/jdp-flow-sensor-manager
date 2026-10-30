/**
 * Binary Packet Fixtures for Flow Decoders (NetFlow v5/v9, IPFIX, sFlow v5).
 * Generates RFC-compliant binary Buffers for testing.
 */

export interface V5RecordOptions {
  srcIp?: string;
  dstIp?: string;
  inIfIndex?: number;
  outIfIndex?: number;
  packets?: number;
  bytes?: number;
  srcPort?: number;
  dstPort?: number;
  protocol?: number;
  tcpFlags?: number;
  srcAs?: number;
  dstAs?: number;
}

function ipToBuffer(ip: string): Buffer {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  return Buffer.from(parts);
}

/**
 * Builds a valid NetFlow v5 binary datagram.
 */
export function buildNetFlowV5Packet(
  records: V5RecordOptions[] = [{}],
  headerOverrides: { version?: number; count?: number; samplingInterval?: number } = {}
): Buffer {
  const count = headerOverrides.count ?? records.length;
  const version = headerOverrides.version ?? 5;
  const sampling = headerOverrides.samplingInterval ?? 1;

  const header = Buffer.alloc(24);
  header.writeUInt16BE(version, 0);
  header.writeUInt16BE(count, 2);
  header.writeUInt32BE(100000, 4); // sysUptime = 100,000 ms
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 8); // unixSecs
  header.writeUInt32BE(0, 12); // unixNsecs
  header.writeUInt32BE(1, 16); // flowSeq
  header.writeUInt8(0, 20); // engineType
  header.writeUInt8(0, 21); // engineId
  header.writeUInt16BE(sampling & 0x3fff, 22); // samplingInterval

  const recordBuffers: Buffer[] = [];
  for (const r of records) {
    const rec = Buffer.alloc(48);
    ipToBuffer(r.srcIp || "192.168.1.10").copy(rec, 0);
    ipToBuffer(r.dstIp || "10.0.0.1").copy(rec, 4);
    ipToBuffer("0.0.0.0").copy(rec, 8); // nextHop
    rec.writeUInt16BE(r.inIfIndex ?? 10, 12);
    rec.writeUInt16BE(r.outIfIndex ?? 20, 14);
    rec.writeUInt32BE(r.packets ?? 15, 16);
    rec.writeUInt32BE(r.bytes ?? 15000, 20);
    rec.writeUInt32BE(95000, 24); // firstSwitched
    rec.writeUInt32BE(99000, 28); // lastSwitched
    rec.writeUInt16BE(r.srcPort ?? 44332, 32);
    rec.writeUInt16BE(r.dstPort ?? 443, 34);
    rec.writeUInt8(0, 36); // pad1
    rec.writeUInt8(r.tcpFlags ?? 0x18, 37); // PSH, ACK
    rec.writeUInt8(r.protocol ?? 6, 38); // TCP
    rec.writeUInt8(0, 39); // TOS
    rec.writeUInt16BE(r.srcAs ?? 15169, 40); // Google AS
    rec.writeUInt16BE(r.dstAs ?? 13335, 42); // Cloudflare AS
    rec.writeUInt8(24, 44); // srcMask
    rec.writeUInt8(24, 45); // dstMask
    rec.writeUInt16BE(0, 46); // pad2
    recordBuffers.push(rec);
  }

  return Buffer.concat([header, ...recordBuffers]);
}

/**
 * Builds a NetFlow v9 Template FlowSet packet.
 */
export function buildNetFlowV9TemplatePacket(
  sourceId: number = 1,
  templateId: number = 300,
  fields: Array<{ type: number; length: number }> = [
    { type: 8, length: 4 }, // IPV4_SRC_ADDR
    { type: 11, length: 4 }, // IPV4_DST_ADDR
    { type: 7, length: 2 }, // L4_SRC_PORT
    { type: 12, length: 2 }, // L4_DST_PORT
    { type: 4, length: 1 }, // PROTOCOL
    { type: 10, length: 2 }, // INPUT_SNMP
    { type: 14, length: 2 }, // OUTPUT_SNMP
    { type: 2, length: 4 }, // IN_PKTS
    { type: 1, length: 4 }, // IN_BYTES
  ]
): Buffer {
  const header = Buffer.alloc(20);
  header.writeUInt16BE(9, 0); // version = 9
  header.writeUInt16BE(1, 2); // count = 1 FlowSet
  header.writeUInt32BE(50000, 4); // sysUptime
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 8);
  header.writeUInt32BE(1, 12); // seq
  header.writeUInt32BE(sourceId, 16);

  const flowSetLen = 4 + 4 + fields.length * 4;
  const flowSet = Buffer.alloc(flowSetLen);
  flowSet.writeUInt16BE(0, 0); // flowset_id = 0 (Template)
  flowSet.writeUInt16BE(flowSetLen, 2);
  flowSet.writeUInt16BE(templateId, 4);
  flowSet.writeUInt16BE(fields.length, 6);

  let offset = 8;
  for (const f of fields) {
    flowSet.writeUInt16BE(f.type, offset);
    flowSet.writeUInt16BE(f.length, offset + 2);
    offset += 4;
  }

  return Buffer.concat([header, flowSet]);
}

/**
 * Builds a NetFlow v9 Data FlowSet packet using template 300.
 */
export function buildNetFlowV9DataPacket(
  sourceId: number = 1,
  templateId: number = 300,
  records: Array<{
    srcIp?: string;
    dstIp?: string;
    srcPort?: number;
    dstPort?: number;
    protocol?: number;
    inIfIndex?: number;
    outIfIndex?: number;
    packets?: number;
    bytes?: number;
  }> = [{}]
): Buffer {
  const header = Buffer.alloc(20);
  header.writeUInt16BE(9, 0);
  header.writeUInt16BE(1, 2);
  header.writeUInt32BE(55000, 4);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 8);
  header.writeUInt32BE(2, 12);
  header.writeUInt32BE(sourceId, 16);

  const recLen = 4 + 4 + 2 + 2 + 1 + 2 + 2 + 4 + 4; // 25 bytes
  const totalDataLen = records.length * recLen;
  const padding = (4 - (totalDataLen % 4)) % 4;
  const flowSetLen = 4 + totalDataLen + padding;

  const flowSet = Buffer.alloc(flowSetLen);
  flowSet.writeUInt16BE(templateId, 0);
  flowSet.writeUInt16BE(flowSetLen, 2);

  let offset = 4;
  for (const r of records) {
    ipToBuffer(r.srcIp || "172.16.0.5").copy(flowSet, offset);
    ipToBuffer(r.dstIp || "8.8.8.8").copy(flowSet, offset + 4);
    flowSet.writeUInt16BE(r.srcPort ?? 51234, offset + 8);
    flowSet.writeUInt16BE(r.dstPort ?? 53, offset + 10);
    flowSet.writeUInt8(r.protocol ?? 17, offset + 12); // UDP
    flowSet.writeUInt16BE(r.inIfIndex ?? 101, offset + 13);
    flowSet.writeUInt16BE(r.outIfIndex ?? 102, offset + 15);
    flowSet.writeUInt32BE(r.packets ?? 5, offset + 17);
    flowSet.writeUInt32BE(r.bytes ?? 450, offset + 21);
    offset += recLen;
  }

  return Buffer.concat([header, flowSet]);
}

/**
 * Builds an IPFIX Template Set packet.
 */
export function buildIpfixTemplatePacket(
  observationDomainId: number = 10,
  templateId: number = 256,
  fields: Array<{ id: number; length: number }> = [
    { id: 8, length: 4 }, // sourceIPv4Address
    { id: 11, length: 4 }, // destinationIPv4Address
    { id: 7, length: 2 }, // sourceTransportPort
    { id: 12, length: 2 }, // destinationTransportPort
    { id: 4, length: 1 }, // protocolIdentifier
    { id: 10, length: 2 }, // ingressInterface
    { id: 14, length: 2 }, // egressInterface
    { id: 2, length: 4 }, // packetDeltaCount
    { id: 1, length: 4 }, // octetDeltaCount
  ]
): Buffer {
  const setLen = 4 + 4 + fields.length * 4;
  const messageLength = 16 + setLen;

  const header = Buffer.alloc(16);
  header.writeUInt16BE(10, 0); // version = 10
  header.writeUInt16BE(messageLength, 2);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 4);
  header.writeUInt32BE(1, 8); // seq
  header.writeUInt32BE(observationDomainId, 12);

  const set = Buffer.alloc(setLen);
  set.writeUInt16BE(2, 0); // set_id = 2 (Template Set)
  set.writeUInt16BE(setLen, 2);
  set.writeUInt16BE(templateId, 4);
  set.writeUInt16BE(fields.length, 6);

  let offset = 8;
  for (const f of fields) {
    set.writeUInt16BE(f.id, offset);
    set.writeUInt16BE(f.length, offset + 2);
    offset += 4;
  }

  return Buffer.concat([header, set]);
}

/**
 * Builds an IPFIX Data Set packet.
 */
export function buildIpfixDataPacket(
  observationDomainId: number = 10,
  templateId: number = 256,
  records: Array<{
    srcIp?: string;
    dstIp?: string;
    srcPort?: number;
    dstPort?: number;
    protocol?: number;
    inIfIndex?: number;
    outIfIndex?: number;
    packets?: number;
    bytes?: number;
  }> = [{}]
): Buffer {
  const recLen = 4 + 4 + 2 + 2 + 1 + 2 + 2 + 4 + 4; // 25 bytes
  const totalDataLen = records.length * recLen;
  const padding = (4 - (totalDataLen % 4)) % 4;
  const setLen = 4 + totalDataLen + padding;
  const messageLength = 16 + setLen;

  const header = Buffer.alloc(16);
  header.writeUInt16BE(10, 0);
  header.writeUInt16BE(messageLength, 2);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 4);
  header.writeUInt32BE(2, 8);
  header.writeUInt32BE(observationDomainId, 12);

  const set = Buffer.alloc(setLen);
  set.writeUInt16BE(templateId, 0);
  set.writeUInt16BE(setLen, 2);

  let offset = 4;
  for (const r of records) {
    ipToBuffer(r.srcIp || "10.10.10.20").copy(set, offset);
    ipToBuffer(r.dstIp || "1.1.1.1").copy(set, offset + 4);
    set.writeUInt16BE(r.srcPort ?? 54321, offset + 8);
    set.writeUInt16BE(r.dstPort ?? 80, offset + 10);
    set.writeUInt8(r.protocol ?? 6, offset + 12); // TCP
    set.writeUInt16BE(r.inIfIndex ?? 5, offset + 13);
    set.writeUInt16BE(r.outIfIndex ?? 6, offset + 15);
    set.writeUInt32BE(r.packets ?? 10, offset + 17);
    set.writeUInt32BE(r.bytes ?? 8500, offset + 21);
    offset += recLen;
  }

  return Buffer.concat([header, set]);
}

/**
 * Builds a valid sFlow v5 packet with 1 flow sample (raw Ethernet + IPv4 packet header).
 */
export function buildSFlowV5Packet(options: {
  agentIp?: string;
  samplingRate?: number;
  inputIf?: number;
  outputIf?: number;
  srcIp?: string;
  dstIp?: string;
  srcPort?: number;
  dstPort?: number;
  protocol?: number;
  frameLength?: number;
} = {}): Buffer {
  const agentIp = options.agentIp || "192.168.100.1";
  const samplingRate = options.samplingRate || 1000;
  const inputIf = options.inputIf ?? 2;
  const outputIf = options.outputIf ?? 3;
  const srcIp = options.srcIp || "192.168.1.50";
  const dstIp = options.dstIp || "203.0.113.1";
  const srcPort = options.srcPort ?? 34567;
  const dstPort = options.dstPort ?? 8080;
  const protocol = options.protocol ?? 6;
  const frameLength = options.frameLength ?? 1420;

  // Header: 28 bytes
  const header = Buffer.alloc(28);
  header.writeUInt32BE(5, 0); // sFlow version = 5
  header.writeUInt32BE(1, 4); // IPv4 agent address
  ipToBuffer(agentIp).copy(header, 8);
  header.writeUInt32BE(1, 12); // sub_agent_id
  header.writeUInt32BE(100, 16); // seq
  header.writeUInt32BE(500000, 20); // uptime
  header.writeUInt32BE(1, 24); // num_samples = 1

  // Raw Ethernet + IPv4 + TCP packet (54 bytes)
  const rawPacket = Buffer.alloc(54);
  // Ethernet: dst MAC (6), src MAC (6), EtherType 0x0800 (2)
  rawPacket.writeUInt16BE(0x0800, 12);
  // IPv4 header (starts at byte 14):
  rawPacket.writeUInt8(0x45, 14); // Version 4, IHL 5 (20 bytes)
  rawPacket.writeUInt8(0x00, 15); // TOS
  rawPacket.writeUInt16BE(40, 16); // total length
  rawPacket.writeUInt8(64, 22); // TTL
  rawPacket.writeUInt8(protocol, 23); // Protocol (TCP)
  ipToBuffer(srcIp).copy(rawPacket, 26);
  ipToBuffer(dstIp).copy(rawPacket, 30);
  // TCP header (starts at byte 34):
  rawPacket.writeUInt16BE(srcPort, 34);
  rawPacket.writeUInt16BE(dstPort, 36);
  rawPacket.writeUInt8(0x10, 47); // ACK flag

  // Flow Record: Raw packet header (format 1)
  const rawRecordLen = 16 + rawPacket.length;
  const rawRecordPadded = (rawRecordLen + 3) & ~3;
  const flowRecord = Buffer.alloc(8 + rawRecordPadded);
  flowRecord.writeUInt32BE(1, 0); // flow_format = 1 (Raw packet header)
  flowRecord.writeUInt32BE(rawRecordLen, 4);
  flowRecord.writeUInt32BE(1, 8); // header_protocol = 1 (Ethernet)
  flowRecord.writeUInt32BE(frameLength, 12);
  flowRecord.writeUInt32BE(0, 16); // stripped
  flowRecord.writeUInt32BE(rawPacket.length, 20); // header_size
  rawPacket.copy(flowRecord, 24);

  // Sample: Flow sample (format 1)
  const sampleHeaderLen = 32; // seq, sourceId, rate, pool, drops, inIf, outIf, numRecords
  const sampleDataLen = sampleHeaderLen + flowRecord.length;
  const sample = Buffer.alloc(8 + sampleDataLen);
  sample.writeUInt32BE(1, 0); // format = 1 (Flow sample)
  sample.writeUInt32BE(sampleDataLen, 4); // sample_length
  sample.writeUInt32BE(1, 8); // seq
  sample.writeUInt32BE(0x01000000, 12); // sourceId
  sample.writeUInt32BE(samplingRate, 16);
  sample.writeUInt32BE(1000, 20); // pool
  sample.writeUInt32BE(0, 24); // drops
  sample.writeUInt32BE(inputIf, 28);
  sample.writeUInt32BE(outputIf, 32);
  sample.writeUInt32BE(1, 36); // num_flow_records = 1
  flowRecord.copy(sample, 40);

  return Buffer.concat([header, sample]);
}

