import { db } from "../db";
import { sensors, devices } from "../db/schema";
import { eq } from "drizzle-orm";
import type { FlowProtocol, FlowDirection, SensorStatus } from "@/types";

export interface RegisteredSensor {
  id: string;
  deviceId: string;
  deviceHostname: string;
  exporterIp: string;
  name: string;
  protocol: FlowProtocol;
  collectorIp: string;
  collectorPort: number;
  ifIndex: number | null;
  samplingRate: number;
  direction: FlowDirection;
  status: SensorStatus;
  registeredAt: string;
}

export interface MatchFlowOptions {
  exporterIp: string;
  collectorPort: number;
  protocol: FlowProtocol;
  inIfIndex?: number | null;
  outIfIndex?: number | null;
}

export interface MatchResult {
  sensor: RegisteredSensor | null;
  deviceId: string | null;
  isKnownExporter: boolean;
}

export interface RegistryStatus {
  totalSensorsInDb: number;
  activeInRegistry: number;
  collectorState: "STANDBY" | "RUNNING" | "STOPPED" | "ERROR";
  collectorMessage: string;
  lastSyncedAt: string;
}

class SensorRegistry {
  private static instance: SensorRegistry;
  // Map keyed by `${exporterIp}:${collectorPort}:${ifIndex ?? 'any'}`
  private registryMap: Map<string, RegisteredSensor> = new Map();
  // Map keyed by sensor ID for quick access
  private sensorIdMap: Map<string, string> = new Map();
  // Device lookup keyed by management IP
  private knownExporters: Map<string, { deviceId: string; hostname: string }> = new Map();
  private lastSyncedAt: string = new Date().toISOString();

  private constructor() {}

  public static getInstance(): SensorRegistry {
    if (!SensorRegistry.instance) {
      SensorRegistry.instance = new SensorRegistry();
    }
    return SensorRegistry.instance;
  }

  private makeKey(exporterIp: string, collectorPort: number, ifIndex?: number | null): string {
    return `${exporterIp.trim()}:${collectorPort}:${ifIndex !== null && ifIndex !== undefined ? ifIndex : "any"}`;
  }

  /**
   * Register or update a sensor in the dynamic memory table.
   * Eliminates the need to manually edit collector config files!
   */
  public register(sensor: RegisteredSensor): void {
    // If already registered under old key, unregister first
    const existingKey = this.sensorIdMap.get(sensor.id);
    if (existingKey) {
      this.registryMap.delete(existingKey);
    }

    if (sensor.status !== "disabled" && sensor.status !== "draft") {
      const key = this.makeKey(sensor.exporterIp, sensor.collectorPort, sensor.ifIndex);
      this.registryMap.set(key, sensor);
      this.sensorIdMap.set(sensor.id, key);
    } else {
      this.sensorIdMap.delete(sensor.id);
    }

    // Keep exporter mapping up to date
    this.knownExporters.set(sensor.exporterIp.trim(), {
      deviceId: sensor.deviceId,
      hostname: sensor.deviceHostname,
    });

    this.lastSyncedAt = new Date().toISOString();
  }

  /**
   * Unregister a sensor from dynamic lookup.
   */
  public unregister(sensorId: string): void {
    const key = this.sensorIdMap.get(sensorId);
    if (key) {
      this.registryMap.delete(key);
      this.sensorIdMap.delete(sensorId);
      this.lastSyncedAt = new Date().toISOString();
    }
  }

  /**
   * Legacy lookup matching sensor record when a flow packet arrives.
   */
  public lookupSensor(
    exporterIp: string,
    collectorPort: number,
    ifIndex?: number | null
  ): RegisteredSensor | undefined {
    const cleanIp = exporterIp.trim();
    // 1. Exact match on exporter + port + ifIndex
    if (ifIndex !== null && ifIndex !== undefined) {
      const specificKey = this.makeKey(cleanIp, collectorPort, ifIndex);
      const specific = this.registryMap.get(specificKey);
      if (specific) return specific;
    }

    // 2. Fallback to router-wide sensor (any ifIndex)
    const routerKey = this.makeKey(cleanIp, collectorPort, null);
    return this.registryMap.get(routerKey);
  }

  /**
   * Phase 4 Dynamic Flow Record Matching Engine:
   * 1. Validates whether exporter is a known device.
   * 2. Matches flow records by protocol and port.
   * 3. Resolves interface index (ingress/egress) and direction.
   * 4. Falls back to router-wide (ifIndex = null) sensor if configured.
   */
  public matchFlowRecord(options: MatchFlowOptions): MatchResult {
    const cleanIp = options.exporterIp.trim();
    const known = this.knownExporters.get(cleanIp);
    const isKnownExporter = !!known;
    const deviceId = known ? known.deviceId : null;

    // Filter candidate sensors for this exporter + port + protocol
    const candidates: RegisteredSensor[] = [];
    for (const sensor of this.registryMap.values()) {
      if (
        sensor.exporterIp === cleanIp &&
        sensor.collectorPort === options.collectorPort &&
        sensor.protocol === options.protocol &&
        sensor.status !== "disabled" &&
        sensor.status !== "draft"
      ) {
        candidates.push(sensor);
      }
    }

    if (candidates.length === 0) {
      return { sensor: null, deviceId, isKnownExporter };
    }

    // 1. Match ingress interface
    if (options.inIfIndex !== null && options.inIfIndex !== undefined) {
      const ingressMatch = candidates.find(
        (s) =>
          s.ifIndex === options.inIfIndex &&
          (s.direction === "ingress" || s.direction === "both")
      );
      if (ingressMatch) {
        return { sensor: ingressMatch, deviceId: ingressMatch.deviceId, isKnownExporter: true };
      }
    }

    // 2. Match egress interface
    if (options.outIfIndex !== null && options.outIfIndex !== undefined) {
      const egressMatch = candidates.find(
        (s) =>
          s.ifIndex === options.outIfIndex &&
          (s.direction === "egress" || s.direction === "both")
      );
      if (egressMatch) {
        return { sensor: egressMatch, deviceId: egressMatch.deviceId, isKnownExporter: true };
      }
    }

    // 3. Match router-wide (global) sensor
    const globalMatch = candidates.find((s) => s.ifIndex === null);
    if (globalMatch) {
      return { sensor: globalMatch, deviceId: globalMatch.deviceId, isKnownExporter: true };
    }

    return { sensor: null, deviceId, isKnownExporter };
  }

  /**
   * Get all actively registered sensors.
   */
  public getActiveSensors(): RegisteredSensor[] {
    return Array.from(this.registryMap.values());
  }

  /**
   * Synchronize the in-memory registry with the database.
   */
  public async syncFromDatabase(): Promise<number> {
    const allDevices = await db.select().from(devices);
    this.knownExporters.clear();
    for (const d of allDevices) {
      this.knownExporters.set(d.managementIp.trim(), {
        deviceId: d.id,
        hostname: d.hostname,
      });
    }

    const allSensors = await db
      .select({
        sensor: sensors,
        device: devices,
      })
      .from(sensors)
      .innerJoin(devices, eq(sensors.deviceId, devices.id));

    this.registryMap.clear();
    this.sensorIdMap.clear();

    let registeredCount = 0;
    const now = new Date().toISOString();

    for (const row of allSensors) {
      if (row.sensor.status !== "disabled" && row.sensor.status !== "draft") {
        const item: RegisteredSensor = {
          id: row.sensor.id,
          deviceId: row.device.id,
          deviceHostname: row.device.hostname,
          exporterIp: row.device.managementIp,
          name: row.sensor.name,
          protocol: row.sensor.protocol as FlowProtocol,
          collectorIp: row.sensor.collectorIp,
          collectorPort: row.sensor.collectorPort,
          ifIndex: row.sensor.ifIndex,
          samplingRate: row.sensor.samplingRate,
          direction: row.sensor.direction as FlowDirection,
          status: row.sensor.status as SensorStatus,
          registeredAt: now,
        };

        const key = this.makeKey(item.exporterIp, item.collectorPort, item.ifIndex);
        this.registryMap.set(key, item);
        this.sensorIdMap.set(item.id, key);
        registeredCount++;
      }
    }

    this.lastSyncedAt = now;
    return registeredCount;
  }

  /**
   * Get dynamic registry health and readiness status.
   */
  public async getRegistryStatus(collectorState?: "STANDBY" | "RUNNING" | "STOPPED" | "ERROR", collectorMessage?: string): Promise<RegistryStatus> {
    const allSensors = await db.select().from(sensors);

    return {
      totalSensorsInDb: allSensors.length,
      activeInRegistry: this.registryMap.size,
      collectorState: collectorState || "STANDBY",
      collectorMessage:
        collectorMessage ||
        "Phase 3: Sensor Dynamic Registry is synchronized. UDP flow ingestion pipeline ready.",
      lastSyncedAt: this.lastSyncedAt,
    };
  }
}

export const sensorRegistry = SensorRegistry.getInstance();
