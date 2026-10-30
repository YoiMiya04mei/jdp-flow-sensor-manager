import { describe, it, expect, beforeEach } from "vitest";
import { NetFlowV5Parser } from "../src/server/collector/parsers/netflow-v5-parser";
import { NetFlowV9Parser } from "../src/server/collector/parsers/netflow-v9-parser";
import { IpfixParser } from "../src/server/collector/parsers/ipfix-parser";
import { SFlowV5Parser } from "../src/server/collector/parsers/sflow-v5-parser";
import { detectProtocol } from "../src/server/collector/parsers/protocol-detector";
import {
  buildNetFlowV5Packet,
  buildNetFlowV9TemplatePacket,
  buildNetFlowV9DataPacket,
  buildIpfixTemplatePacket,
  buildIpfixDataPacket,
  buildSFlowV5Packet,
} from "./fixtures/flow-packets";

describe("Phase 4: Flow Decoders & Protocol Parsers", () => {
  describe("Protocol Detector", () => {
    it("correctly identifies NetFlow v5, v9, IPFIX, and sFlow v5", () => {
      const v5 = buildNetFlowV5Packet();
      const v9 = buildNetFlowV9TemplatePacket();
      const ipfix = buildIpfixTemplatePacket();
      const sflow = buildSFlowV5Packet();

      expect(detectProtocol(v5)).toBe("netflow_v5");
      expect(detectProtocol(v9)).toBe("netflow_v9");
      expect(detectProtocol(ipfix)).toBe("ipfix");
      expect(detectProtocol(sflow)).toBe("sflow_v5");

      // Random garbage
      const invalid = Buffer.from([0x99, 0x99, 0x12, 0x34]);
      expect(detectProtocol(invalid)).toBeNull();
      expect(detectProtocol(Buffer.from([]))).toBeNull();
    });
  });

  describe("NetFlow v5 Parser", () => {
    const parser = new NetFlowV5Parser();

    it("parses valid NetFlow v5 datagram with correct fields", () => {
      const packet = buildNetFlowV5Packet([
        {
          srcIp: "10.0.1.50",
          dstIp: "172.16.2.100",
          inIfIndex: 12,
          outIfIndex: 14,
          packets: 42,
          bytes: 38500,
          srcPort: 52000,
          dstPort: 80,
          protocol: 6,
          srcAs: 15169,
          dstAs: 13335,
        },
      ]);

      const res = parser.parse(packet, "192.168.1.1", 2055);
      expect(res.success).toBe(true);
      expect(res.protocol).toBe("netflow_v5");
      expect(res.records.length).toBe(1);

      const rec = res.records[0];
      expect(rec.srcIp).toBe("10.0.1.50");
      expect(rec.dstIp).toBe("172.16.2.100");
      expect(rec.inIfIndex).toBe(12);
      expect(rec.outIfIndex).toBe(14);
      expect(rec.packetCount).toBe(42);
      expect(rec.byteCount).toBe(38500);
      expect(rec.srcPort).toBe(52000);
      expect(rec.dstPort).toBe(80);
      expect(rec.ipProtocol).toBe(6);
      expect(rec.srcAsn).toBe(15169);
      expect(rec.dstAsn).toBe(13335);
    });

    it("rejects truncated NetFlow v5 header", () => {
      const truncated = Buffer.alloc(16); // Minimum is 24
      const res = parser.parse(truncated, "192.168.1.1", 2055);
      expect(res.success).toBe(false);
      expect(res.error).toContain("too short");
    });

    it("rejects packet with truncated records", () => {
      // Header specifies 2 records, but only provides 1 record
      const packet = buildNetFlowV5Packet([{}], { count: 2 });
      const res = parser.parse(packet, "192.168.1.1", 2055);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Truncated NetFlow v5 packet");
    });

    it("rejects invalid NetFlow version number", () => {
      const packet = buildNetFlowV5Packet([{}], { version: 4 });
      const res = parser.parse(packet, "192.168.1.1", 2055);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Invalid NetFlow v5 version");
    });
  });

  describe("NetFlow v9 Parser", () => {
    let parser: NetFlowV9Parser;

    beforeEach(() => {
      parser = new NetFlowV9Parser();
    });

    it("parses template and decodes subsequent data FlowSets", () => {
      const exporterIp = "10.0.0.1";
      const sourceId = 1;
      const templateId = 300;

      // 1. Send template packet
      const tmplPacket = buildNetFlowV9TemplatePacket(sourceId, templateId);
      const tmplRes = parser.parse(tmplPacket, exporterIp, 2055);
      expect(tmplRes.success).toBe(true);
      expect(parser.getCacheSize()).toBe(1);

      // 2. Send data packet
      const dataPacket = buildNetFlowV9DataPacket(sourceId, templateId, [
        {
          srcIp: "192.168.10.5",
          dstIp: "8.8.8.8",
          srcPort: 45000,
          dstPort: 53,
          protocol: 17,
          inIfIndex: 201,
          outIfIndex: 202,
          packets: 8,
          bytes: 640,
        },
      ]);

      const dataRes = parser.parse(dataPacket, exporterIp, 2055);
      expect(dataRes.success).toBe(true);
      expect(dataRes.records.length).toBe(1);

      const rec = dataRes.records[0];
      expect(rec.srcIp).toBe("192.168.10.5");
      expect(rec.dstIp).toBe("8.8.8.8");
      expect(rec.srcPort).toBe(45000);
      expect(rec.dstPort).toBe(53);
      expect(rec.ipProtocol).toBe(17);
      expect(rec.inIfIndex).toBe(201);
      expect(rec.outIfIndex).toBe(202);
      expect(rec.packetCount).toBe(8);
      expect(rec.byteCount).toBe(640);
    });

    it("handles data packet with unknown template gracefully", () => {
      const dataPacket = buildNetFlowV9DataPacket(1, 999, [{}]);
      const res = parser.parse(dataPacket, "10.0.0.2", 2055);
      expect(res.success).toBe(true);
      expect(res.records.length).toBe(0);
      expect(res.header?.missingTemplateCount).toBe(1);
      expect(res.error).toContain("Waiting for NetFlow v9 template");
    });
  });

  describe("IPFIX Parser", () => {
    let parser: IpfixParser;

    beforeEach(() => {
      parser = new IpfixParser();
    });

    it("parses Template Set and decodes subsequent Data Sets", () => {
      const exporterIp = "172.16.10.1";
      const obsDomainId = 5;
      const templateId = 256;

      // 1. Send template
      const tmplPacket = buildIpfixTemplatePacket(obsDomainId, templateId);
      const tmplRes = parser.parse(tmplPacket, exporterIp, 2055);
      expect(tmplRes.success).toBe(true);
      expect(parser.getCacheSize()).toBe(1);

      // 2. Send data
      const dataPacket = buildIpfixDataPacket(obsDomainId, templateId, [
        {
          srcIp: "10.50.0.1",
          dstIp: "1.1.1.1",
          srcPort: 38000,
          dstPort: 443,
          protocol: 6,
          inIfIndex: 55,
          outIfIndex: 56,
          packets: 20,
          bytes: 18000,
        },
      ]);

      const dataRes = parser.parse(dataPacket, exporterIp, 2055);
      expect(dataRes.success).toBe(true);
      expect(dataRes.records.length).toBe(1);

      const rec = dataRes.records[0];
      expect(rec.srcIp).toBe("10.50.0.1");
      expect(rec.dstIp).toBe("1.1.1.1");
      expect(rec.srcPort).toBe(38000);
      expect(rec.dstPort).toBe(443);
      expect(rec.ipProtocol).toBe(6);
      expect(rec.inIfIndex).toBe(55);
      expect(rec.outIfIndex).toBe(56);
      expect(rec.packetCount).toBe(20);
      expect(rec.byteCount).toBe(18000);
    });

    it("scopes template cache by observationDomainId and exporterIp", () => {
      const templateId = 256;
      // Register on domain 1
      parser.parse(buildIpfixTemplatePacket(1, templateId), "10.0.0.1", 2055);

      // Data on domain 2 from same exporter should miss cache
      const dataRes = parser.parse(buildIpfixDataPacket(2, templateId), "10.0.0.1", 2055);
      expect(dataRes.records.length).toBe(0);
      expect(dataRes.header?.missingTemplateCount).toBe(1);
    });
  });

  describe("sFlow v5 Parser", () => {
    const parser = new SFlowV5Parser();

    it("parses valid sFlow v5 flow sample with raw packet header", () => {
      const packet = buildSFlowV5Packet({
        agentIp: "192.168.200.1",
        inputIf: 15,
        outputIf: 16,
        srcIp: "192.168.1.75",
        dstIp: "142.250.190.46",
        srcPort: 51234,
        dstPort: 443,
        protocol: 6,
        samplingRate: 2000,
        frameLength: 1500,
      });

      const res = parser.parse(packet, "192.168.200.1", 6343);
      expect(res.success).toBe(true);
      expect(res.protocol).toBe("sflow_v5");
      expect(res.records.length).toBe(1);

      const rec = res.records[0];
      expect(rec.srcIp).toBe("192.168.1.75");
      expect(rec.dstIp).toBe("142.250.190.46");
      expect(rec.srcPort).toBe(51234);
      expect(rec.dstPort).toBe(443);
      expect(rec.ipProtocol).toBe(6);
      expect(rec.inIfIndex).toBe(15);
      expect(rec.outIfIndex).toBe(16);
      expect(rec.samplingRate).toBe(2000);
      expect(rec.byteCount).toBe(1500);
      expect(rec.packetCount).toBe(1);
    });

    it("safely handles truncated sFlow datagrams", () => {
      const res = parser.parse(Buffer.alloc(12), "10.0.0.1", 6343);
      expect(res.success).toBe(false);
      expect(res.error).toContain("too short");
    });
  });
});

