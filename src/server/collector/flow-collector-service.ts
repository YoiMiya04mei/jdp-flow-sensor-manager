import dgram from "node:dgram";
import { db } from "../db";
import { sensors, sensorStatusHistory, collectorTelemetry } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import type { FlowProtocol } from "@/types";
import type {
  CollectorTelemetry,
  PortBindStatus,
  IProtocolParser,
} from "./types";
import { NetFlowV5Parser } from "./parsers/netflow-v5-parser";
import { NetFlowV9Parser } from "./parsers/netflow-v9-parser";
import { IpfixParser } from "./parsers/ipfix-parser";
import { SFlowV5Parser } from "./parsers/sflow-v5-parser";
import { detectProtocol } from "./parsers/protocol-detector";
import { normalizeFlowRecords } from "./normalizer";
import { sensorRegistry } from "../sensors/sensor-registry";
import { analyticsStore } from "../analytics/analytics-store";

export interface CollectorOptions {
  host?: string;
  ports?: number[];
  staleTimeoutSeconds?: number;
  flushIntervalMs?: number;
}

export class FlowCollectorService {
  private static instance: FlowCollectorService;

  private host: string;
  private targetPorts: number[];
  private staleTimeoutMs: number;
  private flushIntervalMs: number;

  private sockets: Map<number, dgram.Socket> = new Map();
  private portStatuses: Map<number, PortBindStatus> = new Map();
  private state: "stopped" | "starting" | "running" | "error" = "stopped";
  private startedAt: string | null = null;
  private lastPacketReceivedAt: string | null = null;

  // Parsers
  private v5Parser: NetFlowV5Parser;
  private v9Parser: NetFlowV9Parser;
  private ipfixParser: IpfixParser;
  private sflowParser: SFlowV5Parser;

  // Telemetry counters
  private packetsReceived = 0;
  private packetsValid = 0;
  private packetsMalformed = 0;
  private packetsUnsupported = 0;
  private flowsParsed = 0;
  private flowsMatched = 0;
  private unknownExporters = 0;
  private parseErrorsByProtocol: Record<FlowProtocol, number> = {
    netflow_v5: 0,
    netflow_v9: 0,
    ipfix: 0,
    sflow_v5: 0,
  };

  // Batched sensor metric accumulator (sensorId -> counters)
  private pendingSensorUpdates: Map<
    string,
    {
      packets: number;
      bytes: number;
      flows: number;
      lastSeenMs: number;
    }
  > = new Map();

  // Background interval timers
  private flushTimer: NodeJS.Timeout | null = null;
  private staleCheckTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private registrySyncTimer: NodeJS.Timeout | null = null;

  public constructor(options: CollectorOptions = {}) {
    this.host = options.host || process.env.FLOW_COLLECTOR_HOST || "0.0.0.0";
    const defaultPorts = [2055, 6343, 9995];
    const envPorts = process.env.FLOW_COLLECTOR_PORTS
      ? process.env.FLOW_COLLECTOR_PORTS.split(",")
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => !isNaN(p) && p > 0 && p <= 65535)
      : null;

    this.targetPorts = options.ports || envPorts || defaultPorts;
    this.staleTimeoutMs =
      (options.staleTimeoutSeconds ||
        parseInt(process.env.FLOW_STALE_TIMEOUT_SECS || "180", 10)) * 1000;
    this.flushIntervalMs = options.flushIntervalMs || 3000;

    this.v5Parser = new NetFlowV5Parser();
    this.v9Parser = new NetFlowV9Parser();
    this.ipfixParser = new IpfixParser();
    this.sflowParser = new SFlowV5Parser();

    for (const port of this.targetPorts) {
      this.portStatuses.set(port, { port, bound: false });
    }
  }

  public static getInstance(options?: CollectorOptions): FlowCollectorService {
    const globalRef = globalThis as unknown as {
      __FLOW_COLLECTOR_INSTANCE__?: FlowCollectorService;
    };
    if (!globalRef.__FLOW_COLLECTOR_INSTANCE__) {
      globalRef.__FLOW_COLLECTOR_INSTANCE__ = new FlowCollectorService(options);
    }
    return globalRef.__FLOW_COLLECTOR_INSTANCE__;
  }

  /**
   * Start the flow collector UDP listeners.
   */
  public async start(): Promise<PortBindStatus[]> {
    if (this.state === "running") {
      return this.getPortStatuses();
    }

    this.state = "starting";
    this.startedAt = new Date().toISOString();

    // 1. Initial registry sync from persistent database
    await sensorRegistry.syncFromDatabase();

    // 2. Bind UDP sockets
    const bindPromises: Promise<PortBindStatus>[] = [];
    for (const port of this.targetPorts) {
      bindPromises.push(this.bindPort(port));
    }

    const statuses = await Promise.all(bindPromises);

    // Determine state based on bind results
    const anyBound = statuses.some((s) => s.bound);
    const anyFailed = statuses.some((s) => !s.bound);

    if (anyBound && !anyFailed) {
      this.state = "running";
    } else if (anyBound && anyFailed) {
      this.state = "running"; // Partial
    } else {
      this.state = "error";
    }

    // 3. Start background flush & stale check timers
    this.startBackgroundTimers();

    return statuses;
  }

  /**
   * Bind an individual UDP port.
   */
  private bindPort(port: number): Promise<PortBindStatus> {
    return new Promise((resolve) => {
      // Close existing socket if already present
      const existing = this.sockets.get(port);
      if (existing) {
        try {
          existing.close();
        } catch {
          // Ignore
        }
        this.sockets.delete(port);
      }

      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      socket.on("error", (err: Error) => {
        const status: PortBindStatus = {
          port,
          bound: false,
          error: err.message,
        };
        this.portStatuses.set(port, status);
        try {
          socket.close();
        } catch {
          // Ignore
        }
        this.sockets.delete(port);
        resolve(status);
      });

      socket.on("message", (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        this.handleDatagram(msg, rinfo, port);
      });

      try {
        socket.bind(port, this.host, () => {
          try {
            socket.setRecvBufferSize(4 * 1024 * 1024); // 4 MB OS socket receive buffer
          } catch {
            // Ignore if OS restricts buffer size
          }
          const status: PortBindStatus = {
            port,
            bound: true,
          };
          this.portStatuses.set(port, status);
          this.sockets.set(port, socket);
          resolve(status);
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const status: PortBindStatus = {
          port,
          bound: false,
          error: errorMsg,
        };
        this.portStatuses.set(port, status);
        resolve(status);
      }
    });
  }

  /**
   * Core Ingestion Pipeline:
   * UDP Receive -> Detect Protocol -> Binary Parse -> Sensor Match & Normalize -> Store & State Machine
   */
  public handleDatagram(
    packet: Buffer,
    rinfo: { address: string; port: number },
    collectorPort: number
  ): void {
    this.packetsReceived++;
    this.lastPacketReceivedAt = new Date().toISOString();

    const exporterIp = rinfo.address;
    const exporterPort = rinfo.port;

    // 1. Detect wire protocol
    const protocol = detectProtocol(packet);
    if (!protocol) {
      this.packetsUnsupported++;
      return;
    }

    // 2. Select appropriate parser
    const parser = this.getParser(protocol);
    if (!parser) {
      this.packetsUnsupported++;
      return;
    }

    // 3. Binary parsing
    let parseResult;
    try {
      parseResult = parser.parse(packet, exporterIp, exporterPort);
    } catch (err: unknown) {
      this.packetsMalformed++;
      this.parseErrorsByProtocol[protocol]++;
      return;
    }

    if (!parseResult.success || (parseResult.records.length === 0 && parseResult.error)) {
      this.packetsMalformed++;
      this.parseErrorsByProtocol[protocol]++;
      return;
    }

    if (parseResult.records.length === 0) {
      return;
    }

    this.packetsValid++;
    this.flowsParsed += parseResult.records.length;

    // 4. Normalize flow records & match with dynamic sensor registry
    const normResult = normalizeFlowRecords(
      parseResult.records,
      exporterIp,
      exporterPort,
      collectorPort,
      protocol,
      this.lastPacketReceivedAt
    );

    if (!normResult.isKnownExporter) {
      this.unknownExporters++;
    }

    if (normResult.matchedFlows > 0) {
      this.flowsMatched += normResult.matchedFlows;

      // 5. Update sensor state machine for matched sensors
      for (const [sensorId, update] of normResult.sensorUpdates.entries()) {
        this.recordSensorActivity(sensorId, update);
      }
    }

    // 6. Ingest normalized records into analytics store (non-blocking)
    if (normResult.records.length > 0) {
      analyticsStore.insertBatch(normResult.records).catch(() => {
        // Telemetry tracking for storage errors
      });
    }
  }

  private getParser(protocol: FlowProtocol): IProtocolParser | null {
    switch (protocol) {
      case "netflow_v5":
        return this.v5Parser;
      case "netflow_v9":
        return this.v9Parser;
      case "ipfix":
        return this.ipfixParser;
      case "sflow_v5":
        return this.sflowParser;
      default:
        return null;
    }
  }

  /**
   * Record flow activity on a sensor and handle State Machine transitions:
   * - Transition waiting_for_flow -> active (on first valid flow)
   * - Transition stale -> active (on recovered flow)
   */
  private recordSensorActivity(
    sensorId: string,
    update: { packets: number; bytes: number; flows: number; lastSeenMs: number }
  ): void {
    // Accumulate metrics in memory
    const existing = this.pendingSensorUpdates.get(sensorId) || {
      packets: 0,
      bytes: 0,
      flows: 0,
      lastSeenMs: update.lastSeenMs,
    };
    existing.packets += update.packets;
    existing.bytes += update.bytes;
    existing.flows += update.flows;
    existing.lastSeenMs = Math.max(existing.lastSeenMs, update.lastSeenMs);
    this.pendingSensorUpdates.set(sensorId, existing);

    // Evaluate state machine transition
    const activeSensors = sensorRegistry.getActiveSensors();
    const registered = activeSensors.find((s) => s.id === sensorId);

    if (registered) {
      if (registered.status === "waiting_for_flow" || registered.status === "stale") {
        const oldStatus = registered.status;
        const newStatus = "active";
        const now = new Date().toISOString();
        const reason =
          oldStatus === "waiting_for_flow"
            ? `First valid flow received from ${registered.exporterIp}`
            : `Flow resumed from ${registered.exporterIp}`;

        // Update in-memory registry status
        registered.status = newStatus;

        // Persist state change and history in DB immediately
        db.update(sensors)
          .set({
            status: newStatus,
            lastFlowAt: now,
            updatedAt: now,
          })
          .where(eq(sensors.id, sensorId))
          .catch(() => {});

        db.insert(sensorStatusHistory)
          .values({
            id: crypto.randomUUID(),
            sensorId,
            oldStatus,
            newStatus,
            triggerReason: reason,
            changedAt: now,
          })
          .catch(() => {});
      }
    }
  }

  /**
   * Flush in-memory accumulated sensor metrics to database.
   */
  public async flushSensorMetrics(): Promise<void> {
    if (this.pendingSensorUpdates.size === 0) return;

    const updates = Array.from(this.pendingSensorUpdates.entries());
    this.pendingSensorUpdates.clear();

    const now = new Date().toISOString();

    for (const [sensorId, data] of updates) {
      try {
        await db
          .update(sensors)
          .set({
            lastFlowAt: new Date(data.lastSeenMs).toISOString(),
            totalFlowsReceived: sql`${sensors.totalFlowsReceived} + ${data.flows}`,
            totalPacketsReceived: sql`${sensors.totalPacketsReceived} + ${data.packets}`,
            totalBytesReceived: sql`${sensors.totalBytesReceived} + ${data.bytes}`,
            updatedAt: now,
          })
          .where(eq(sensors.id, sensorId));
      } catch {
        // Re-queue or drop on error
      }
    }
  }

  /**
   * Check for stale sensors (no flow received within stale timeout).
   */
  public async checkStaleSensors(): Promise<number> {
    const activeSensors = sensorRegistry.getActiveSensors();
    const now = Date.now();
    let staleCount = 0;

    for (const sensor of activeSensors) {
      if (sensor.status === "active") {
        const [dbSensor] = await db
          .select()
          .from(sensors)
          .where(eq(sensors.id, sensor.id))
          .limit(1);

        if (dbSensor && dbSensor.lastFlowAt) {
          const lastFlowTime = new Date(dbSensor.lastFlowAt).getTime();
          if (now - lastFlowTime > this.staleTimeoutMs) {
            // Transition to stale
            const oldStatus = "active";
            const newStatus = "stale";
            const timestampIso = new Date().toISOString();
            const reason = `No flow received for >${Math.floor(this.staleTimeoutMs / 1000)}s`;

            sensor.status = newStatus;
            await db
              .update(sensors)
              .set({
                status: newStatus,
                updatedAt: timestampIso,
              })
              .where(eq(sensors.id, sensor.id));

            await db.insert(sensorStatusHistory).values({
              id: crypto.randomUUID(),
              sensorId: sensor.id,
              oldStatus,
              newStatus,
              triggerReason: reason,
              changedAt: timestampIso,
            });

            staleCount++;
          }
        }
      }
    }

    return staleCount;
  }

  /**
   * Publish ground-truth collector heartbeat and telemetry to SQLite.
   * Enables separate web application processes to observe live ingestion status.
   */
  public async publishHeartbeat(): Promise<void> {
    try {
      const now = new Date().toISOString();
      const telemetry = this.getTelemetry();
      const row = {
        id: "active_daemon",
        pid: process.pid,
        state: telemetry.state,
        listenHost: telemetry.listenHost,
        portsJson: JSON.stringify(telemetry.ports),
        packetsReceived: telemetry.packetsReceived,
        packetsValid: telemetry.packetsValid,
        packetsMalformed: telemetry.packetsMalformed,
        packetsUnsupported: telemetry.packetsUnsupported,
        flowsParsed: telemetry.flowsParsed,
        flowsMatched: telemetry.flowsMatched,
        unknownExporters: telemetry.unknownExporters,
        parseErrorsJson: JSON.stringify(telemetry.parseErrorsByProtocol),
        templateStatsJson: JSON.stringify(telemetry.templateCacheStats),
        lastPacketAt: telemetry.lastPacketReceivedAt,
        startedAt: telemetry.startedAt || now,
        updatedAt: now,
      };

      const [existing] = await db
        .select()
        .from(collectorTelemetry)
        .where(eq(collectorTelemetry.id, "active_daemon"))
        .limit(1);

      if (existing) {
        await db
          .update(collectorTelemetry)
          .set(row)
          .where(eq(collectorTelemetry.id, "active_daemon"));
      } else {
        await db.insert(collectorTelemetry).values(row);
      }
    } catch {
      // Non-blocking telemetry heartbeat failure
    }
  }

  private startBackgroundTimers(): void {
    this.stopBackgroundTimers();

    this.flushTimer = setInterval(() => {
      this.flushSensorMetrics().catch(() => {});
    }, this.flushIntervalMs);

    this.staleCheckTimer = setInterval(() => {
      this.checkStaleSensors().catch(() => {});
    }, Math.max(15_000, Math.floor(this.staleTimeoutMs / 4)));

    // Heartbeat every 2 seconds for web application observability
    this.heartbeatTimer = setInterval(() => {
      this.publishHeartbeat().catch(() => {});
    }, 2000);

    // Dynamic registry sync every 3 seconds to pick up sensors added from Web UI
    this.registrySyncTimer = setInterval(() => {
      sensorRegistry.syncFromDatabase().catch(() => {});
    }, 3000);

    // Initial heartbeat
    this.publishHeartbeat().catch(() => {});

    // Prevent timers from keeping test processes alive
    if (this.flushTimer.unref) this.flushTimer.unref();
    if (this.staleCheckTimer.unref) this.staleCheckTimer.unref();
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
    if (this.registrySyncTimer.unref) this.registrySyncTimer.unref();
  }

  private stopBackgroundTimers(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.registrySyncTimer) {
      clearInterval(this.registrySyncTimer);
      this.registrySyncTimer = null;
    }
  }

  /**
   * Stop the collector and close all sockets gracefully.
   */
  public async stop(): Promise<void> {
    this.stopBackgroundTimers();
    await this.flushSensorMetrics();

    // Mark daemon as stopped in shared database
    try {
      await db
        .update(collectorTelemetry)
        .set({ state: "stopped", updatedAt: new Date().toISOString() })
        .where(eq(collectorTelemetry.id, "active_daemon"));
    } catch {
      // Ignore
    }

    for (const [port, socket] of this.sockets.entries()) {
      try {
        socket.close();
      } catch {
        // Ignore
      }
      const status = this.portStatuses.get(port);
      if (status) {
        status.bound = false;
      }
    }

    this.sockets.clear();
    this.state = "stopped";
  }

  public getPortStatuses(): PortBindStatus[] {
    return Array.from(this.portStatuses.values());
  }

  public getTelemetry(): CollectorTelemetry {
    return {
      state: this.state,
      listenHost: this.host,
      ports: this.getPortStatuses(),
      packetsReceived: this.packetsReceived,
      packetsValid: this.packetsValid,
      packetsMalformed: this.packetsMalformed,
      packetsUnsupported: this.packetsUnsupported,
      flowsParsed: this.flowsParsed,
      flowsMatched: this.flowsMatched,
      unknownExporters: this.unknownExporters,
      parseErrorsByProtocol: { ...this.parseErrorsByProtocol },
      templateCacheStats: {
        netflowV9Count: this.v9Parser.getCacheSize(),
        ipfixCount: this.ipfixParser.getCacheSize(),
      },
      lastPacketReceivedAt: this.lastPacketReceivedAt,
      startedAt: this.startedAt,
    };
  }

  public resetTelemetry(): void {
    this.packetsReceived = 0;
    this.packetsValid = 0;
    this.packetsMalformed = 0;
    this.packetsUnsupported = 0;
    this.flowsParsed = 0;
    this.flowsMatched = 0;
    this.unknownExporters = 0;
    this.parseErrorsByProtocol = {
      netflow_v5: 0,
      netflow_v9: 0,
      ipfix: 0,
      sflow_v5: 0,
    };
    this.lastPacketReceivedAt = null;
  }
}

export const flowCollectorService = FlowCollectorService.getInstance();

