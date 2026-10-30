import { db } from "../db";
import { flowRecords } from "../db/schema";
import type {
  IAnalyticsStore,
  NormalizedFlowRecord,
  FlowQueryParams,
  FlowQueryResult,
  AnalyticsStoreStats,
} from "./types";
import { and, gte, lte, eq, or, sql, desc, asc } from "drizzle-orm";

/**
 * Shared Persistent SQLite Analytics Store.
 * Solves the separate process isolation problem between Next.js and the UDP collector daemon:
 * Both processes read and write to the same SQLite WAL database (data/jdp_noc.db).
 */
export class SqliteAnalyticsStore implements IAnalyticsStore {
  readonly engine = "sqlite" as const;
  private readonly maxCapacity: number;
  private pendingRecords: NormalizedFlowRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(maxCapacity: number = 100_000) {
    this.maxCapacity = maxCapacity;
    this.startBackgroundFlush();
  }

  private startBackgroundFlush(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, 1000);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  public async insertBatch(records: NormalizedFlowRecord[]): Promise<void> {
    if (records.length === 0) return;
    this.pendingRecords.push(...records);

    // If queue is large, trigger asynchronous flush
    if (this.pendingRecords.length >= 2000 && !this.isFlushing) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Flush accumulated records into SQLite in batched transactions.
   */
  public async flush(): Promise<void> {
    if (this.pendingRecords.length === 0 || this.isFlushing) return;
    this.isFlushing = true;

    const toInsert = this.pendingRecords;
    this.pendingRecords = [];

    try {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        await db.insert(flowRecords).values(
          chunk.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            receivedAt: r.receivedAt,
            exporterIp: r.exporterIp,
            exporterPort: r.exporterPort,
            collectorPort: r.collectorPort,
            sensorId: r.sensorId || null,
            deviceId: r.deviceId || null,
            protocol: r.protocol,
            ipVersion: r.ipVersion,
            srcIp: r.srcIp,
            dstIp: r.dstIp,
            srcPort: r.srcPort,
            dstPort: r.dstPort,
            ipProtocol: r.ipProtocol,
            tcpFlags: r.tcpFlags ?? null,
            inIfIndex: r.inIfIndex ?? null,
            outIfIndex: r.outIfIndex ?? null,
            packetCount: r.packetCount,
            byteCount: r.byteCount,
            samplingRate: r.samplingRate,
            samplingAdjustedPackets: r.samplingAdjustedPackets,
            samplingAdjustedBytes: r.samplingAdjustedBytes,
            srcAsn: r.srcAsn ?? null,
            dstAsn: r.dstAsn ?? null,
            completeness: r.completeness,
          }))
        );
      }

      // Evict excess records periodically
      const [countResult] = await db
        .select({ total: sql<number>`count(*)` })
        .from(flowRecords);

      const total = Number(countResult?.total || 0);
      if (total > this.maxCapacity) {
        const excess = total - this.maxCapacity;
        await db.run(sql`
          DELETE FROM flow_records 
          WHERE id IN (
            SELECT id FROM flow_records 
            ORDER BY timestamp ASC 
            LIMIT ${excess}
          )
        `);
      }
    } catch {
      // Non-blocking write failure
    } finally {
      this.isFlushing = false;
    }
  }

  private buildWhereConditions(params: FlowQueryParams = {}) {
    const conditions: any[] = [];

    if (params.startTime !== undefined) {
      conditions.push(gte(flowRecords.timestamp, params.startTime));
    }
    if (params.endTime !== undefined) {
      conditions.push(lte(flowRecords.timestamp, params.endTime));
    }
    if (params.sensorId && params.sensorId !== "all") {
      conditions.push(eq(flowRecords.sensorId, params.sensorId));
    }
    if (params.deviceId && params.deviceId !== "all") {
      conditions.push(eq(flowRecords.deviceId, params.deviceId));
    }
    if (params.exporterIp) {
      conditions.push(eq(flowRecords.exporterIp, params.exporterIp));
    }
    if (params.srcIp) {
      conditions.push(eq(flowRecords.srcIp, params.srcIp));
    }
    if (params.dstIp) {
      conditions.push(eq(flowRecords.dstIp, params.dstIp));
    }
    if (params.srcAsn !== undefined) {
      conditions.push(eq(flowRecords.srcAsn, params.srcAsn));
    }
    if (params.dstAsn !== undefined) {
      conditions.push(eq(flowRecords.dstAsn, params.dstAsn));
    }
    if (params.ipVersion !== undefined) {
      conditions.push(eq(flowRecords.ipVersion, params.ipVersion));
    }
    if (params.ipProtocol !== undefined) {
      conditions.push(eq(flowRecords.ipProtocol, params.ipProtocol));
    }
    if (params.port !== undefined) {
      conditions.push(
        or(eq(flowRecords.srcPort, params.port), eq(flowRecords.dstPort, params.port))
      );
    }
    if (params.srcPort !== undefined) {
      conditions.push(eq(flowRecords.srcPort, params.srcPort));
    }
    if (params.dstPort !== undefined) {
      conditions.push(eq(flowRecords.dstPort, params.dstPort));
    }
    if (params.inIfIndex !== undefined) {
      conditions.push(eq(flowRecords.inIfIndex, params.inIfIndex));
    }
    if (params.outIfIndex !== undefined) {
      conditions.push(eq(flowRecords.outIfIndex, params.outIfIndex));
    }
    if (params.protocol && params.protocol !== ("all" as any)) {
      conditions.push(eq(flowRecords.protocol, params.protocol));
    }
    if (params.search) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`lower(${flowRecords.srcIp}) LIKE ${q}`,
          sql`lower(${flowRecords.dstIp}) LIKE ${q}`,
          sql`lower(${flowRecords.exporterIp}) LIKE ${q}`
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  public async getAll(params: FlowQueryParams = {}): Promise<NormalizedFlowRecord[]> {
    const where = this.buildWhereConditions(params);
    const query = db
      .select()
      .from(flowRecords)
      .where(where)
      .orderBy(desc(flowRecords.timestamp));

    const rows = await query;
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      receivedAt: r.receivedAt,
      exporterIp: r.exporterIp,
      exporterPort: r.exporterPort,
      collectorPort: r.collectorPort,
      sensorId: r.sensorId,
      deviceId: r.deviceId,
      protocol: r.protocol as any,
      ipVersion: r.ipVersion as any,
      srcIp: r.srcIp,
      dstIp: r.dstIp,
      srcPort: r.srcPort,
      dstPort: r.dstPort,
      ipProtocol: r.ipProtocol,
      tcpFlags: r.tcpFlags,
      inIfIndex: r.inIfIndex,
      outIfIndex: r.outIfIndex,
      packetCount: r.packetCount,
      byteCount: r.byteCount,
      samplingRate: r.samplingRate,
      samplingAdjustedPackets: r.samplingAdjustedPackets,
      samplingAdjustedBytes: r.samplingAdjustedBytes,
      srcAsn: r.srcAsn,
      dstAsn: r.dstAsn,
      completeness: r.completeness as any,
    }));
  }

  public async query(params: FlowQueryParams = {}): Promise<FlowQueryResult> {
    const where = this.buildWhereConditions(params);

    // 1. Aggregation totals
    const [aggregates] = await db
      .select({
        total: sql<number>`count(*)`,
        totalBytes: sql<number>`coalesce(sum(${flowRecords.byteCount}), 0)`,
        totalPackets: sql<number>`coalesce(sum(${flowRecords.packetCount}), 0)`,
        totalAdjustedBytes: sql<number>`coalesce(sum(${flowRecords.samplingAdjustedBytes}), 0)`,
        totalAdjustedPackets: sql<number>`coalesce(sum(${flowRecords.samplingAdjustedPackets}), 0)`,
      })
      .from(flowRecords)
      .where(where);

    const total = Number(aggregates?.total || 0);

    // 2. Paginated rows
    const limit = Math.min(1000, Math.max(1, params.limit || 50));
    const offset = Math.max(0, params.offset || 0);

    const rows = await db
      .select()
      .from(flowRecords)
      .where(where)
      .orderBy(desc(flowRecords.timestamp))
      .limit(limit)
      .offset(offset);

    const records: NormalizedFlowRecord[] = rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      receivedAt: r.receivedAt,
      exporterIp: r.exporterIp,
      exporterPort: r.exporterPort,
      collectorPort: r.collectorPort,
      sensorId: r.sensorId,
      deviceId: r.deviceId,
      protocol: r.protocol as any,
      ipVersion: r.ipVersion as any,
      srcIp: r.srcIp,
      dstIp: r.dstIp,
      srcPort: r.srcPort,
      dstPort: r.dstPort,
      ipProtocol: r.ipProtocol,
      tcpFlags: r.tcpFlags,
      inIfIndex: r.inIfIndex,
      outIfIndex: r.outIfIndex,
      packetCount: r.packetCount,
      byteCount: r.byteCount,
      samplingRate: r.samplingRate,
      samplingAdjustedPackets: r.samplingAdjustedPackets,
      samplingAdjustedBytes: r.samplingAdjustedBytes,
      srcAsn: r.srcAsn,
      dstAsn: r.dstAsn,
      completeness: r.completeness as any,
    }));

    return {
      records,
      total,
      totalBytes: Number(aggregates?.totalBytes || 0),
      totalPackets: Number(aggregates?.totalPackets || 0),
      totalAdjustedBytes: Number(aggregates?.totalAdjustedBytes || 0),
      totalAdjustedPackets: Number(aggregates?.totalAdjustedPackets || 0),
    };
  }

  public getStats(): AnalyticsStoreStats {
    // Synchronous metadata representation for telemetry
    return {
      totalRecordsStored: 0,
      maxCapacity: this.maxCapacity,
      oldestRecordTimestamp: null,
      newestRecordTimestamp: null,
      storageEngine: this.engine,
      retentionDescription: `Shared Persistent SQLite Storage (FIFO retention up to ${this.maxCapacity.toLocaleString()} flows). Multi-process safe.`,
    };
  }

  public async clear(): Promise<void> {
    await db.delete(flowRecords);
  }
}

