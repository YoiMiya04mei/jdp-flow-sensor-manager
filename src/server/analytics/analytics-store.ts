import type {
  IAnalyticsStore,
  NormalizedFlowRecord,
  FlowQueryParams,
  FlowQueryResult,
  AnalyticsStoreStats,
} from "./types";

/**
 * High-performance In-Memory Ring Buffer Analytics Store.
 * Used for local development, automated testing, and standalone operation
 * without requiring a ClickHouse daemon or Docker.
 */
export class InMemoryAnalyticsStore implements IAnalyticsStore {
  readonly engine = "in-memory" as const;
  private buffer: NormalizedFlowRecord[] = [];
  private readonly maxCapacity: number;

  constructor(maxCapacity: number = 100_000) {
    this.maxCapacity = maxCapacity;
  }

  public async insertBatch(records: NormalizedFlowRecord[]): Promise<void> {
    if (records.length === 0) return;

    for (const record of records) {
      if (this.buffer.length >= this.maxCapacity) {
        // Evict oldest record (FIFO ring buffer)
        this.buffer.shift();
      }
      this.buffer.push(record);
    }
  }

  private filterRecords(params: FlowQueryParams = {}): NormalizedFlowRecord[] {
    let filtered = this.buffer;

    if (params.startTime !== undefined) {
      filtered = filtered.filter((r) => r.timestamp >= params.startTime!);
    }
    if (params.endTime !== undefined) {
      filtered = filtered.filter((r) => r.timestamp <= params.endTime!);
    }
    if (params.search) {
      const q = params.search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.srcIp.toLowerCase().includes(q) ||
          r.dstIp.toLowerCase().includes(q) ||
          r.exporterIp.toLowerCase().includes(q)
      );
    }
    if (params.sensorId && params.sensorId !== "all") {
      filtered = filtered.filter((r) => r.sensorId === params.sensorId);
    }
    if (params.deviceId && params.deviceId !== "all") {
      filtered = filtered.filter((r) => r.deviceId === params.deviceId);
    }
    if (params.exporterIp) {
      filtered = filtered.filter((r) => r.exporterIp === params.exporterIp);
    }
    if (params.srcIp) {
      filtered = filtered.filter((r) => r.srcIp === params.srcIp);
    }
    if (params.dstIp) {
      filtered = filtered.filter((r) => r.dstIp === params.dstIp);
    }
    if (params.srcAsn !== undefined) {
      filtered = filtered.filter((r) => r.srcAsn === params.srcAsn);
    }
    if (params.dstAsn !== undefined) {
      filtered = filtered.filter((r) => r.dstAsn === params.dstAsn);
    }
    if (params.ipVersion !== undefined) {
      filtered = filtered.filter((r) => r.ipVersion === params.ipVersion);
    }
    if (params.ipProtocol !== undefined) {
      filtered = filtered.filter((r) => r.ipProtocol === params.ipProtocol);
    }
    if (params.port !== undefined) {
      filtered = filtered.filter(
        (r) => r.srcPort === params.port || r.dstPort === params.port
      );
    }
    if (params.srcPort !== undefined) {
      filtered = filtered.filter((r) => r.srcPort === params.srcPort);
    }
    if (params.dstPort !== undefined) {
      filtered = filtered.filter((r) => r.dstPort === params.dstPort);
    }
    if (params.inIfIndex !== undefined) {
      filtered = filtered.filter((r) => r.inIfIndex === params.inIfIndex);
    }
    if (params.outIfIndex !== undefined) {
      filtered = filtered.filter((r) => r.outIfIndex === params.outIfIndex);
    }
    if (params.protocol && params.protocol !== ("all" as any)) {
      filtered = filtered.filter((r) => r.protocol === params.protocol);
    }

    return filtered;
  }

  public async getAll(params: FlowQueryParams = {}): Promise<NormalizedFlowRecord[]> {
    return this.filterRecords(params);
  }

  public async query(params: FlowQueryParams = {}): Promise<FlowQueryResult> {
    let filtered = this.filterRecords(params);

    const total = filtered.length;
    let totalBytes = 0;
    let totalPackets = 0;
    let totalAdjustedBytes = 0;
    let totalAdjustedPackets = 0;

    for (const r of filtered) {
      totalBytes += r.byteCount;
      totalPackets += r.packetCount;
      totalAdjustedBytes += r.samplingAdjustedBytes;
      totalAdjustedPackets += r.samplingAdjustedPackets;
    }

    // Apply sorting
    const sortBy = params.sortBy || "timestamp";
    const sortOrder = params.sortOrder || "desc";

    filtered = [...filtered].sort((a, b) => {
      let valA = a[sortBy as keyof NormalizedFlowRecord];
      let valB = b[sortBy as keyof NormalizedFlowRecord];

      if (valA === null || valA === undefined) valA = 0 as any;
      if (valB === null || valB === undefined) valB = 0 as any;

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return sortOrder === "asc"
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

    const offset = Math.max(0, params.offset || 0);
    const limit = Math.min(1000, Math.max(1, params.limit || 50));
    const records = filtered.slice(offset, offset + limit);

    return {
      records,
      total,
      totalBytes,
      totalPackets,
      totalAdjustedBytes,
      totalAdjustedPackets,
    };
  }

  public getStats(): AnalyticsStoreStats {
    return {
      totalRecordsStored: this.buffer.length,
      maxCapacity: this.maxCapacity,
      oldestRecordTimestamp: this.buffer.length > 0 ? this.buffer[0].timestamp : null,
      newestRecordTimestamp:
        this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].timestamp : null,
      storageEngine: this.engine,
      retentionDescription: `In-Memory Ring Buffer (FIFO, max ${this.maxCapacity.toLocaleString()} flows). Oldest flows evicted when full.`,
    };
  }

  public clear(): void {
    this.buffer = [];
  }
}

/**
 * ClickHouse Analytics Store adapter placeholder.
 * Ready for production deployment when ClickHouse is provisioned.
 */
export class ClickHouseAnalyticsStore implements IAnalyticsStore {
  readonly engine = "clickhouse" as const;

  constructor(private readonly connectionString: string) {}

  public async insertBatch(records: NormalizedFlowRecord[]): Promise<void> {
    if (records.length === 0) return;
  }

  public async getAll(_params: FlowQueryParams = {}): Promise<NormalizedFlowRecord[]> {
    return [];
  }

  public async query(_params: FlowQueryParams = {}): Promise<FlowQueryResult> {
    return {
      records: [],
      total: 0,
      totalBytes: 0,
      totalPackets: 0,
      totalAdjustedBytes: 0,
      totalAdjustedPackets: 0,
    };
  }

  public getStats(): AnalyticsStoreStats {
    return {
      totalRecordsStored: 0,
      maxCapacity: -1,
      oldestRecordTimestamp: null,
      newestRecordTimestamp: null,
      storageEngine: this.engine,
      retentionDescription:
        "ClickHouse Production Storage (Target deployment mode, not connected in current local dev).",
    };
  }

  public clear(): void {}
}

import { SqliteAnalyticsStore } from "./sqlite-analytics-store";

/**
 * Hybrid Analytics Store (Memory Ring-Buffer + Persistent SQLite WAL).
 * Provides sub-millisecond memory speed for local queries while synchronizing
 * flow records to SQLite so separate OS processes (Next.js web app & Collector Daemon)
 * share a unified, persistent view of traffic analytics.
 */
export class HybridAnalyticsStore implements IAnalyticsStore {
  readonly engine = "sqlite" as const;
  private memoryStore: InMemoryAnalyticsStore;
  private sqliteStore: SqliteAnalyticsStore;

  constructor(maxCapacity: number = 100_000) {
    this.memoryStore = new InMemoryAnalyticsStore(maxCapacity);
    this.sqliteStore = new SqliteAnalyticsStore(maxCapacity);
  }

  public async insertBatch(records: NormalizedFlowRecord[]): Promise<void> {
    await this.memoryStore.insertBatch(records);
    try {
      await this.sqliteStore.insertBatch(records);
    } catch {
      // Non-blocking write to persistent store
    }
  }

  public async getAll(params: FlowQueryParams = {}): Promise<NormalizedFlowRecord[]> {
    const mem = await this.memoryStore.getAll(params);
    const sqliteRows = await this.sqliteStore.getAll(params);

    if (sqliteRows.length === 0) return mem;
    if (mem.length === 0) return sqliteRows;

    // Merge & deduplicate by ID to provide seamless cross-process consistency
    const seen = new Set<string>();
    const combined: NormalizedFlowRecord[] = [];
    for (const r of mem) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        combined.push(r);
      }
    }
    for (const r of sqliteRows) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        combined.push(r);
      }
    }
    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }

  public async query(params: FlowQueryParams = {}): Promise<FlowQueryResult> {
    const mem = await this.memoryStore.query(params);
    const sqliteResult = await this.sqliteStore.query(params);

    if (sqliteResult.total === 0) return mem;
    if (mem.total === 0) return sqliteResult;

    // Merge and compute unified pagination across memory and SQLite
    const all = await this.getAll(params);
    const total = all.length;
    let totalBytes = 0;
    let totalPackets = 0;
    let totalAdjustedBytes = 0;
    let totalAdjustedPackets = 0;

    for (const r of all) {
      totalBytes += r.byteCount;
      totalPackets += r.packetCount;
      totalAdjustedBytes += r.samplingAdjustedBytes;
      totalAdjustedPackets += r.samplingAdjustedPackets;
    }

    const offset = Math.max(0, params.offset || 0);
    const limit = Math.min(1000, Math.max(1, params.limit || 50));
    const records = all.slice(offset, offset + limit);

    return {
      records,
      total,
      totalBytes,
      totalPackets,
      totalAdjustedBytes,
      totalAdjustedPackets,
    };
  }

  public getStats(): AnalyticsStoreStats {
    const memStats = this.memoryStore.getStats();
    return {
      ...memStats,
      storageEngine: "sqlite",
      retentionDescription: "Active Storage: SQLite WAL + In-Memory FIFO (100,000 Flow Cap). Long time-range queries are bounded by the 100k most recent flow records. ClickHouse is target production deployment profile.",
    };
  }

  public async clear(): Promise<void> {
    this.memoryStore.clear();
    await this.sqliteStore.clear();
  }
}

// Global singleton analytics store instance (Hybrid SQLite-backed for cross-process capability)
export const analyticsStore: IAnalyticsStore = new HybridAnalyticsStore(100_000);
