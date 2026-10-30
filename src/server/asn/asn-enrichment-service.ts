import { db } from "../db";
import { asnDirectory, prefixMapping, customerNetworks } from "../db/schema";
import { RadixTrie, isPrivateOrReservedIp } from "./prefix-trie";
import { seedBaselineAsnData } from "./seed-asn-data";
import { analyticsStore } from "../analytics/analytics-store";
import type { FlowQueryParams, NormalizedFlowRecord } from "../analytics/types";
import { eq, desc } from "drizzle-orm";

export interface ResolvedAsnInfo {
  asn: number | null;
  name: string;
  country: string;
  source: "exporter" | "prefix_lookup" | "private_network" | "unknown";
  status: "resolved" | "private" | "unknown";
  matchedPrefix: string | null;
  reason?: string;
}

export interface ResolvedCustomerInfo {
  id: string;
  name: string;
  networkType: "customer" | "internal" | "infrastructure" | "partner" | "external";
  matchedPrefix: string | null;
}

export interface AsnAggregateEntry {
  asn: number | null;
  name: string;
  country: string;
  organizationType: string;
  bytes: number; // raw bytes
  packets: number; // raw packets
  adjustedBytes: number; // sampling-adjusted bytes
  adjustedPackets: number; // sampling-adjusted packets
  flowCount: number;
  percentage: number;
  estimatedBps: number;
  estimatedPps: number;
}

export interface TopAsnAnalyticsResult {
  topSourceAsns: AsnAggregateEntry[];
  topDestinationAsns: AsnAggregateEntry[];
  totalAdjustedVolume: number;
  totalFlows: number;
  unmappedVolume: number;
  unmappedFlows: number;
  privateVolume: number;
  privateFlows: number;
  timeRangeStart: number;
  timeRangeEnd: number;
  durationSeconds: number;
}

export interface SankeyNode {
  id: string;
  name: string;
  category: "source_asn" | "destination_asn" | "customer_network";
  asn?: number | null;
  orgName?: string;
  value: number; // total incoming or outgoing volume
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number; // weight (bytes, packets, bps)
  flowCount: number;
  percentage: number;
}

export interface SankeyGraphResult {
  nodes: SankeyNode[];
  links: SankeyLink[];
  mode: "asn_to_asn" | "asn_to_customer";
  metric: "bytes" | "packets" | "bps";
  totalValue: number;
  groupedOtherCount: number;
  timeRangeStart: number;
  timeRangeEnd: number;
}

export class AsnEnrichmentService {
  private static instance: AsnEnrichmentService;

  // Prefix trie for IP-to-ASN Longest Prefix Match
  private prefixTrie: RadixTrie<{ asn: number; source: string }> = new RadixTrie();
  // Prefix trie for Customer Network Longest Prefix Match
  private customerTrie: RadixTrie<ResolvedCustomerInfo> = new RadixTrie();
  // In-memory ASN Directory map (ASN -> Org Details)
  private asnDirMap: Map<number, { name: string; country: string; orgType: string }> = new Map();

  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): AsnEnrichmentService {
    if (!AsnEnrichmentService.instance) {
      AsnEnrichmentService.instance = new AsnEnrichmentService();
    }
    return AsnEnrichmentService.instance;
  }

  /**
   * Initialize or reload ASN Directory and Prefix Tries from persistent DB.
   */
  public async initialize(): Promise<void> {
    // 1. Seed baseline data if prefix mapping or customer networks are empty
    const countPrefixes = await db.select().from(prefixMapping).limit(1);
    if (countPrefixes.length === 0) {
      await seedBaselineAsnData();
    }

    // 2. Load ASN Directory into memory
    const allAsns = await db.select().from(asnDirectory);
    this.asnDirMap.clear();
    for (const item of allAsns) {
      this.asnDirMap.set(item.asn, {
        name: item.name,
        country: item.country,
        orgType: item.organizationType || "transit",
      });
    }

    // 3. Load active Prefix Mappings into Radix Trie
    const allPrefixes = await db
      .select()
      .from(prefixMapping)
      .where(eq(prefixMapping.active, true));

    this.prefixTrie.clear();
    for (const pfx of allPrefixes) {
      this.prefixTrie.insert(pfx.cidr, { asn: pfx.asn, source: pfx.source });
    }

    // 4. Load active Customer Networks into Customer Radix Trie
    const allCustomers = await db
      .select()
      .from(customerNetworks)
      .where(eq(customerNetworks.active, true));

    this.customerTrie.clear();
    for (const cust of allCustomers) {
      this.customerTrie.insert(cust.cidr, {
        id: cust.id,
        name: cust.name,
        networkType: cust.networkType as any,
        matchedPrefix: cust.cidr,
      });
    }

    this.isInitialized = true;
  }

  /**
   * Precedence Rule for ASN Resolution:
   * 1. Check RFC1918 / Private / Reserved IP -> "Private / Internal Network"
   * 2. Explicit ASN from Exporter packet (if > 0)
   * 3. Longest Prefix Match (LPM) via Prefix Radix Trie
   * 4. Unknown ASN
   */
  public resolveAsn(ip: string, explicitAsn: number | null): ResolvedAsnInfo {
    // 1. Check Private / RFC1918 IP
    const priv = isPrivateOrReservedIp(ip);
    if (priv.isPrivate) {
      return {
        asn: null,
        name: "Private / Internal Network",
        country: "PRIVATE",
        source: "private_network",
        status: "private",
        matchedPrefix: null,
        reason: priv.reason,
      };
    }

    // 2. Check explicit ASN provided by router flow exporter
    if (explicitAsn !== null && explicitAsn !== undefined && explicitAsn > 0) {
      const org = this.asnDirMap.get(explicitAsn);
      return {
        asn: explicitAsn,
        name: org ? org.name : `AS${explicitAsn}`,
        country: org ? org.country : "UNKNOWN",
        source: "exporter",
        status: "resolved",
        matchedPrefix: null,
      };
    }

    // 3. Longest Prefix Match lookup in Radix Trie
    const match = this.prefixTrie.lookup(ip);
    if (match) {
      const matchedAsn = match.data.asn;
      const org = this.asnDirMap.get(matchedAsn);
      return {
        asn: matchedAsn,
        name: org ? org.name : `AS${matchedAsn}`,
        country: org ? org.country : "UNKNOWN",
        source: "prefix_lookup",
        status: "resolved",
        matchedPrefix: match.cidr,
      };
    }

    // 4. Fallback: Unknown ASN
    return {
      asn: null,
      name: "Unknown / Unallocated ASN",
      country: "UNKNOWN",
      source: "unknown",
      status: "unknown",
      matchedPrefix: null,
    };
  }

  /**
   * Resolves Customer / Internal Network via Customer Radix Trie.
   */
  public resolveCustomer(ip: string): ResolvedCustomerInfo {
    const match = this.customerTrie.lookup(ip);
    if (match) {
      return {
        id: match.data.id,
        name: match.data.name,
        networkType: match.data.networkType,
        matchedPrefix: match.cidr,
      };
    }

    return {
      id: "unclassified",
      name: "External / Unmapped Network",
      networkType: "external",
      matchedPrefix: null,
    };
  }

  /**
   * Top ASNs Analytics Aggregation.
   */
  public async getTopAsns(
    params: FlowQueryParams = {},
    limit: number = 10
  ): Promise<TopAsnAnalyticsResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const records = await analyticsStore.getAll(params);

    const now = Date.now();
    const startTime = params.startTime ?? now - 3600_000;
    const endTime = params.endTime ?? now;
    const durationSeconds = Math.max(1, (endTime - startTime) / 1000);

    const totalAdjustedVolume = records.reduce((sum, r) => sum + r.samplingAdjustedBytes, 0);

    let unmappedVolume = 0;
    let unmappedFlows = 0;
    let privateVolume = 0;
    let privateFlows = 0;

    const srcAsnMap = new Map<string, { asn: number | null; name: string; country: string; orgType: string; bytes: number; pkts: number; adjBytes: number; adjPkts: number; flows: number }>();
    const dstAsnMap = new Map<string, { asn: number | null; name: string; country: string; orgType: string; bytes: number; pkts: number; adjBytes: number; adjPkts: number; flows: number }>();

    for (const r of records) {
      const srcInfo = this.resolveAsn(r.srcIp, r.srcAsn);
      const dstInfo = this.resolveAsn(r.dstIp, r.dstAsn);

      if (srcInfo.status === "unknown" || dstInfo.status === "unknown") {
        unmappedVolume += r.samplingAdjustedBytes;
        unmappedFlows += 1;
      }
      if (srcInfo.status === "private" || dstInfo.status === "private") {
        privateVolume += r.samplingAdjustedBytes;
        privateFlows += 1;
      }

      // Aggregate Source ASN
      const srcKey = srcInfo.asn ? String(srcInfo.asn) : srcInfo.name;
      const s = srcAsnMap.get(srcKey) || {
        asn: srcInfo.asn,
        name: srcInfo.name,
        country: srcInfo.country,
        orgType: srcInfo.asn ? this.asnDirMap.get(srcInfo.asn)?.orgType || "transit" : "internal",
        bytes: 0,
        pkts: 0,
        adjBytes: 0,
        adjPkts: 0,
        flows: 0,
      };
      s.bytes += r.byteCount;
      s.pkts += r.packetCount;
      s.adjBytes += r.samplingAdjustedBytes;
      s.adjPkts += r.samplingAdjustedPackets;
      s.flows += 1;
      srcAsnMap.set(srcKey, s);

      // Aggregate Destination ASN
      const dstKey = dstInfo.asn ? String(dstInfo.asn) : dstInfo.name;
      const d = dstAsnMap.get(dstKey) || {
        asn: dstInfo.asn,
        name: dstInfo.name,
        country: dstInfo.country,
        orgType: dstInfo.asn ? this.asnDirMap.get(dstInfo.asn)?.orgType || "transit" : "internal",
        bytes: 0,
        pkts: 0,
        adjBytes: 0,
        adjPkts: 0,
        flows: 0,
      };
      d.bytes += r.byteCount;
      d.pkts += r.packetCount;
      d.adjBytes += r.samplingAdjustedBytes;
      d.adjPkts += r.samplingAdjustedPackets;
      d.flows += 1;
      dstAsnMap.set(dstKey, d);
    }

    const mapToSortedList = (
      m: Map<string, { asn: number | null; name: string; country: string; orgType: string; bytes: number; pkts: number; adjBytes: number; adjPkts: number; flows: number }>
    ): AsnAggregateEntry[] => {
      return Array.from(m.values())
        .map((item) => ({
          asn: item.asn,
          name: item.name,
          country: item.country,
          organizationType: item.orgType,
          bytes: item.bytes,
          packets: item.pkts,
          adjustedBytes: item.adjBytes,
          adjustedPackets: item.adjPkts,
          flowCount: item.flows,
          percentage:
            totalAdjustedVolume > 0
              ? Math.min(100, Math.round((item.adjBytes / totalAdjustedVolume) * 1000) / 10)
              : 0,
          estimatedBps: Math.round((item.adjBytes * 8) / durationSeconds),
          estimatedPps: Math.round(item.adjPkts / durationSeconds),
        }))
        .sort((a, b) => b.adjustedBytes - a.adjustedBytes)
        .slice(0, limit);
    };

    return {
      topSourceAsns: mapToSortedList(srcAsnMap),
      topDestinationAsns: mapToSortedList(dstAsnMap),
      totalAdjustedVolume,
      totalFlows: records.length,
      unmappedVolume,
      unmappedFlows,
      privateVolume,
      privateFlows,
      timeRangeStart: startTime,
      timeRangeEnd: endTime,
      durationSeconds,
    };
  }

  /**
   * Multi-Dimensional Sankey Aggregation Engine:
   * Mode A: Source ASN ➔ Destination ASN
   * Mode B: Source ASN ➔ Customer / Network
   */
  public async getSankeyGraph(
    params: FlowQueryParams = {},
    options: {
      mode?: "asn_to_asn" | "asn_to_customer";
      metric?: "bytes" | "packets" | "bps";
      maxNodes?: number;
      groupOther?: boolean;
    } = {}
  ): Promise<SankeyGraphResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const mode = options.mode || "asn_to_asn";
    const metric = options.metric || "bytes";
    const maxNodes = options.maxNodes || 20;
    const groupOther = options.groupOther !== false;

    const records = await analyticsStore.getAll(params);

    const now = Date.now();
    const startTime = params.startTime ?? now - 3600_000;
    const endTime = params.endTime ?? now;
    const durationSeconds = Math.max(1, (endTime - startTime) / 1000);

    const linkMap = new Map<
      string,
      {
        source: string;
        target: string;
        sourceName: string;
        targetName: string;
        sourceAsn: number | null;
        targetAsn?: number | null;
        rawBytes: number;
        adjBytes: number;
        packets: number;
        flows: number;
      }
    >();

    for (const r of records) {
      const srcInfo = this.resolveAsn(r.srcIp, r.srcAsn);
      const srcNodeId = srcInfo.asn ? `AS${srcInfo.asn}` : srcInfo.name;

      let targetNodeId: string;
      let targetName: string;
      let targetAsn: number | null | undefined = null;

      if (mode === "asn_to_asn") {
        const dstInfo = this.resolveAsn(r.dstIp, r.dstAsn);
        targetNodeId = dstInfo.asn ? `AS${dstInfo.asn}` : dstInfo.name;
        targetName = dstInfo.name;
        targetAsn = dstInfo.asn;
      } else {
        // Mode B: ASN -> Customer Network
        const custInfo = this.resolveCustomer(r.dstIp);
        targetNodeId = custInfo.name;
        targetName = custInfo.name;
      }

      const linkKey = `${srcNodeId}___${targetNodeId}`;
      const entry = linkMap.get(linkKey) || {
        source: srcNodeId,
        target: targetNodeId,
        sourceName: srcInfo.name,
        targetName,
        sourceAsn: srcInfo.asn,
        targetAsn,
        rawBytes: 0,
        adjBytes: 0,
        packets: 0,
        flows: 0,
      };

      entry.rawBytes += r.byteCount;
      entry.adjBytes += r.samplingAdjustedBytes;
      entry.packets += r.samplingAdjustedPackets;
      entry.flows += 1;
      linkMap.set(linkKey, entry);
    }

    // Convert link entries into weight according to metric
    const getWeight = (e: { adjBytes: number; packets: number; rawBytes: number }) => {
      switch (metric) {
        case "bps":
          return Math.round((e.adjBytes * 8) / durationSeconds);
        case "packets":
          return e.packets;
        case "bytes":
        default:
          return e.adjBytes;
      }
    };

    let allLinks = Array.from(linkMap.values()).map((l) => ({
      source: l.source,
      target: l.target,
      sourceName: l.sourceName,
      targetName: l.targetName,
      sourceAsn: l.sourceAsn,
      targetAsn: l.targetAsn,
      weight: getWeight(l),
      flows: l.flows,
    }));

    allLinks.sort((a, b) => b.weight - a.weight);

    const totalValue = allLinks.reduce((sum, l) => sum + l.weight, 0);

    // Grouping small links into "Other"
    let displayLinks = allLinks;
    let groupedOtherCount = 0;

    if (groupOther && allLinks.length > maxNodes) {
      const topLinks = allLinks.slice(0, maxNodes);
      const otherLinks = allLinks.slice(maxNodes);

      let otherWeight = 0;
      let otherFlows = 0;
      for (const ol of otherLinks) {
        otherWeight += ol.weight;
        otherFlows += ol.flows;
      }

      if (otherWeight > 0) {
        topLinks.push({
          source: "Other Sources",
          target: mode === "asn_to_asn" ? "Other ASNs" : "Other Networks",
          sourceName: "Other Sources",
          targetName: mode === "asn_to_asn" ? "Other ASNs" : "Other Networks",
          sourceAsn: null,
          targetAsn: null,
          weight: otherWeight,
          flows: otherFlows,
        });
      }

      displayLinks = topLinks;
      groupedOtherCount = otherLinks.length;
    }

    // Build unique nodes
    const nodeMap = new Map<string, SankeyNode>();

    for (const l of displayLinks) {
      // Source node
      if (!nodeMap.has(l.source)) {
        nodeMap.set(l.source, {
          id: l.source,
          name: l.sourceName,
          category: "source_asn",
          asn: l.sourceAsn,
          orgName: l.sourceName,
          value: 0,
        });
      }
      nodeMap.get(l.source)!.value += l.weight;

      // Target node
      if (!nodeMap.has(l.target)) {
        nodeMap.set(l.target, {
          id: l.target,
          name: l.targetName,
          category: mode === "asn_to_asn" ? "destination_asn" : "customer_network",
          asn: l.targetAsn,
          orgName: l.targetName,
          value: 0,
        });
      }
      nodeMap.get(l.target)!.value += l.weight;
    }

    const sankeyLinks: SankeyLink[] = displayLinks.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.weight,
      flowCount: l.flows,
      percentage:
        totalValue > 0 ? Math.min(100, Math.round((l.weight / totalValue) * 1000) / 10) : 0,
    }));

    return {
      nodes: Array.from(nodeMap.values()),
      links: sankeyLinks,
      mode,
      metric,
      totalValue,
      groupedOtherCount,
      timeRangeStart: startTime,
      timeRangeEnd: endTime,
    };
  }

  /**
   * Search ASN directory.
   */
  public async searchDirectory(query?: string, limit: number = 20) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    let items = Array.from(this.asnDirMap.entries()).map(([asn, details]) => ({
      asn,
      name: details.name,
      country: details.country,
      organizationType: details.orgType,
    }));

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (i) =>
          String(i.asn).includes(q) ||
          i.name.toLowerCase().includes(q) ||
          i.country.toLowerCase().includes(q)
      );
    }

    return items.slice(0, limit);
  }

  /**
   * Get coverage statistics.
   */
  public getCoverageStats() {
    return {
      totalAsnsInDirectory: this.asnDirMap.size,
      totalPrefixesInTrie: this.prefixTrie.getSize(),
      totalCustomerNetworksInTrie: this.customerTrie.getSize(),
      isInitialized: this.isInitialized,
    };
  }
}

export const asnEnrichmentService = AsnEnrichmentService.getInstance();
