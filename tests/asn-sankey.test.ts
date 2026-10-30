import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { RadixTrie, parseIpv4Cidr, isPrivateOrReservedIp } from "../src/server/asn/prefix-trie";
import { asnEnrichmentService } from "../src/server/asn/asn-enrichment-service";
import { analyticsStore } from "../src/server/analytics/analytics-store";
import type { NormalizedFlowRecord } from "../src/server/analytics/types";
import { db } from "../src/server/db";
import { asnDirectory, prefixMapping, customerNetworks, users } from "../src/server/db/schema";
import crypto from "crypto";

import { runMigrations } from "../src/server/db/migrate";

describe("Phase 6: ASN Enrichment & Interactive Sankey Diagram", () => {
  const baseTime = 1700000000000;

  function makeFlow(overrides: Partial<NormalizedFlowRecord> = {}): NormalizedFlowRecord {
    const rawBytes = overrides.byteCount ?? 2000;
    const samplingRate = overrides.samplingRate ?? 1000;
    return {
      id: crypto.randomUUID(),
      timestamp: overrides.timestamp ?? baseTime,
      receivedAt: new Date(overrides.timestamp ?? baseTime).toISOString(),
      exporterIp: "10.0.0.1",
      exporterPort: 2055,
      collectorPort: 2055,
      sensorId: "sns-01",
      deviceId: "dev-01",
      protocol: "netflow_v5",
      ipVersion: 4,
      srcIp: overrides.srcIp ?? "8.8.8.8",
      dstIp: overrides.dstIp ?? "103.10.20.5",
      srcPort: 443,
      dstPort: 54321,
      ipProtocol: 6,
      tcpFlags: null,
      inIfIndex: 1,
      outIfIndex: 2,
      packetCount: overrides.packetCount ?? 10,
      byteCount: rawBytes,
      samplingRate,
      samplingAdjustedPackets: (overrides.packetCount ?? 10) * samplingRate,
      samplingAdjustedBytes: rawBytes * samplingRate,
      srcAsn: overrides.srcAsn !== undefined ? overrides.srcAsn : null,
      dstAsn: overrides.dstAsn !== undefined ? overrides.dstAsn : null,
      completeness: "complete",
    };
  }

  beforeAll(async () => {
    // Run migrations to ensure prefix_mapping & customer_networks exist
    await runMigrations();
    // Initialize ASN directory & radix tries
    await asnEnrichmentService.initialize();
  });

  beforeEach(() => {
    analyticsStore.clear();
  });

  describe("Radix Trie & Longest Prefix Match (LPM)", () => {
    it("validates and normalizes CIDR network boundaries", () => {
      // 192.168.1.155/24 should normalize to network 192.168.1.0/24
      const p1 = parseIpv4Cidr("192.168.1.155/24");
      expect(p1).not.toBeNull();
      expect(p1?.normalizedCidr).toBe("192.168.1.0/24");

      // Invalid CIDRs
      expect(parseIpv4Cidr("999.1.1.1/24")).toBeNull();
      expect(parseIpv4Cidr("10.0.0.1/35")).toBeNull();
      expect(parseIpv4Cidr("invalid-string")).toBeNull();
    });

    it("performs Longest Prefix Match where more specific prefix wins", () => {
      const trie = new RadixTrie<string>();

      // Insert overlapping prefixes:
      // 8.0.0.0/9 (Lumen / Level 3)
      // 8.8.8.0/24 (Google DNS)
      // 8.8.8.8/32 (Google Primary Anycast IP)
      trie.insert("8.0.0.0/9", "Level3");
      trie.insert("8.8.8.0/24", "GoogleSubnet");
      trie.insert("8.8.8.8/32", "GoogleAnycastHost");

      // Lookup 8.8.8.8 -> Must match /32 (GoogleAnycastHost)
      const matchHost = trie.lookup("8.8.8.8");
      expect(matchHost?.data).toBe("GoogleAnycastHost");
      expect(matchHost?.cidr).toBe("8.8.8.8/32");

      // Lookup 8.8.8.100 -> Must match /24 (GoogleSubnet)
      const matchSubnet = trie.lookup("8.8.8.100");
      expect(matchSubnet?.data).toBe("GoogleSubnet");
      expect(matchSubnet?.cidr).toBe("8.8.8.0/24");

      // Lookup 8.1.1.1 -> Must match /9 (Level3)
      const matchLarge = trie.lookup("8.1.1.1");
      expect(matchLarge?.data).toBe("Level3");

      // Lookup 9.9.9.9 -> Unmatched
      expect(trie.lookup("9.9.9.9")).toBeNull();
    });

    it("correctly identifies Private, RFC 1918, CGNAT, and Loopback IP addresses", () => {
      expect(isPrivateOrReservedIp("10.50.1.1").isPrivate).toBe(true);
      expect(isPrivateOrReservedIp("172.20.10.1").isPrivate).toBe(true);
      expect(isPrivateOrReservedIp("192.168.1.1").isPrivate).toBe(true);
      expect(isPrivateOrReservedIp("100.64.1.1").isPrivate).toBe(true); // CGNAT
      expect(isPrivateOrReservedIp("127.0.0.1").isPrivate).toBe(true); // Loopback
      expect(isPrivateOrReservedIp("169.254.1.1").isPrivate).toBe(true); // Link-local
      expect(isPrivateOrReservedIp("::1").isPrivate).toBe(true); // IPv6 Loopback
      expect(isPrivateOrReservedIp("fe80::1").isPrivate).toBe(true); // IPv6 Link-Local

      // Public IPs
      expect(isPrivateOrReservedIp("8.8.8.8").isPrivate).toBe(false);
      expect(isPrivateOrReservedIp("1.1.1.1").isPrivate).toBe(false);
      expect(isPrivateOrReservedIp("180.240.10.1").isPrivate).toBe(false);
    });
  });

  describe("ASN Enrichment Precedence Engine", () => {
    it("classifies RFC 1918 addresses strictly as 'Private / Internal Network'", () => {
      const res = asnEnrichmentService.resolveAsn("192.168.10.5", null);
      expect(res.status).toBe("private");
      expect(res.name).toBe("Private / Internal Network");
      expect(res.source).toBe("private_network");
      expect(res.asn).toBeNull();
    });

    it("prioritizes explicit exporter ASN over prefix lookup", () => {
      // 8.8.8.8 has prefix in trie for AS15169 (Google).
      // But if router exporter explicitly says AS9999 (e.g. BGP policy overwrite):
      const res = asnEnrichmentService.resolveAsn("8.8.8.8", 9999);
      expect(res.asn).toBe(9999);
      expect(res.source).toBe("exporter");
    });

    it("resolves ASN via Longest Prefix Match when packet has no explicit ASN", () => {
      // 1.1.1.1 has no explicit ASN in packet, must resolve via prefix trie to AS13335 (Cloudflare)
      const res = asnEnrichmentService.resolveAsn("1.1.1.1", null);
      expect(res.asn).toBe(13335);
      expect(res.name).toContain("Cloudflare");
      expect(res.source).toBe("prefix_lookup");
      expect(res.matchedPrefix).toBe("1.1.1.0/24");
    });

    it("handles unallocated/unknown public IPs without guessing false ASNs", () => {
      const res = asnEnrichmentService.resolveAsn("198.51.100.1", null); // TEST-NET-2 unmapped
      expect(res.status).toBe("unknown");
      expect(res.asn).toBeNull();
      expect(res.name).toContain("Unknown");
    });
  });

  describe("Customer & Network Attribution", () => {
    it("resolves destination IP to registered customer network via Customer Radix Trie", () => {
      // 103.10.20.5 belongs to Bank Mandiri (103.10.20.0/24)
      const cust = asnEnrichmentService.resolveCustomer("103.10.20.5");
      expect(cust.name).toBe("Corporate Client - Bank Mandiri");
      expect(cust.networkType).toBe("customer");
      expect(cust.matchedPrefix).toBe("103.10.20.0/24");
    });

    it("labels unmapped IPs as external / unclassified", () => {
      const cust = asnEnrichmentService.resolveCustomer("198.51.100.5");
      expect(cust.name).toBe("External / Unmapped Network");
      expect(cust.networkType).toBe("external");
    });
  });

  describe("Top ASNs Analytics Aggregations", () => {
    it("aggregates and ranks Top Source ASNs by traffic volume with accurate percentages", async () => {
      // Ingest flows:
      // Flow 1: Src = 8.8.8.8 (Google AS15169), 10,000 raw bytes * 1000 = 10,000,000 bytes
      // Flow 2: Src = 1.1.1.1 (Cloudflare AS13335), 5,000 raw bytes * 1000 = 5,000,000 bytes
      // Flow 3: Src = 10.0.0.5 (Private RFC1918), 1,000 raw bytes * 1000 = 1,000,000 bytes
      await analyticsStore.insertBatch([
        makeFlow({ srcIp: "8.8.8.8", byteCount: 10_000, samplingRate: 1000 }),
        makeFlow({ srcIp: "1.1.1.1", byteCount: 5_000, samplingRate: 1000 }),
        makeFlow({ srcIp: "10.0.0.5", byteCount: 1_000, samplingRate: 1000 }),
      ]);

      const res = await asnEnrichmentService.getTopAsns({}, 10);
      expect(res.totalAdjustedVolume).toBe(16_000_000);
      expect(res.privateVolume).toBe(1_000_000);

      // Ranked: Google (10MB) > Cloudflare (5MB) > Private (1MB)
      expect(res.topSourceAsns.length).toBeGreaterThanOrEqual(2);
      expect(res.topSourceAsns[0].asn).toBe(15169);
      expect(res.topSourceAsns[0].adjustedBytes).toBe(10_000_000);
      // Percentage = 10MB / 16MB = 62.5%
      expect(res.topSourceAsns[0].percentage).toBe(62.5);

      expect(res.topSourceAsns[1].asn).toBe(13335);
      expect(res.topSourceAsns[1].adjustedBytes).toBe(5_000_000);
      expect(res.topSourceAsns[1].percentage).toBe(31.3);
    });
  });

  describe("Interactive Sankey Graph Engine", () => {
    it("aggregates Mode A (Source ASN -> Destination ASN) links and nodes accurately", async () => {
      // Flow 1: 8.8.8.8 (AS15169 Google) -> 180.240.1.1 (AS7713 Telkom)
      // Flow 2: 1.1.1.1 (AS13335 Cloudflare) -> 180.240.1.1 (AS7713 Telkom)
      await analyticsStore.insertBatch([
        makeFlow({
          srcIp: "8.8.8.8",
          dstIp: "180.240.1.1",
          byteCount: 8000,
          samplingRate: 1000,
        }),
        makeFlow({
          srcIp: "1.1.1.1",
          dstIp: "180.240.1.1",
          byteCount: 4000,
          samplingRate: 1000,
        }),
      ]);

      const graph = await asnEnrichmentService.getSankeyGraph({}, { mode: "asn_to_asn", metric: "bytes" });

      expect(graph.mode).toBe("asn_to_asn");
      expect(graph.totalValue).toBe(12_000_000);

      // Links: AS15169 -> AS7713 (8MB), AS13335 -> AS7713 (4MB)
      expect(graph.links.length).toBe(2);
      const linkGoogle = graph.links.find((l) => l.source === "AS15169" && l.target === "AS7713");
      expect(linkGoogle).toBeDefined();
      expect(linkGoogle?.value).toBe(8_000_000);
      expect(linkGoogle?.percentage).toBe(66.7);

      const linkCloudflare = graph.links.find((l) => l.source === "AS13335" && l.target === "AS7713");
      expect(linkCloudflare).toBeDefined();
      expect(linkCloudflare?.value).toBe(4_000_000);
      expect(linkCloudflare?.percentage).toBe(33.3);

      // Nodes: 2 sources (AS15169, AS13335) and 1 target (AS7713)
      expect(graph.nodes.some((n) => n.id === "AS15169")).toBe(true);
      expect(graph.nodes.some((n) => n.id === "AS13335")).toBe(true);
      expect(graph.nodes.some((n) => n.id === "AS7713")).toBe(true);
    });

    it("aggregates Mode B (Source ASN -> Customer Network) links and nodes accurately", async () => {
      // Flow: 8.8.8.8 (Google) -> 103.10.20.5 (Bank Mandiri customer network)
      await analyticsStore.insertBatch([
        makeFlow({
          srcIp: "8.8.8.8",
          dstIp: "103.10.20.5",
          byteCount: 5000,
          samplingRate: 1000,
        }),
      ]);

      const graph = await asnEnrichmentService.getSankeyGraph({}, { mode: "asn_to_customer", metric: "bytes" });
      expect(graph.mode).toBe("asn_to_customer");

      const link = graph.links[0];
      expect(link.source).toBe("AS15169");
      expect(link.target).toBe("Corporate Client - Bank Mandiri");
      expect(link.value).toBe(5_000_000);
    });
  });
});
