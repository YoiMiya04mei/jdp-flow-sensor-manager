import { db } from "../db";
import { sensors, devices, interfaces, sensorStatusHistory } from "../db/schema";
import { sensorRegistry } from "./sensor-registry";
import { recordAuditLog } from "../audit/audit-service";
import { eq, and, desc } from "drizzle-orm";
import type { CreateSensorInput, UpdateSensorInput } from "@/lib/validations/sensor";
import type { SessionUser, FlowProtocol, FlowDirection, SensorStatus } from "@/types";
import crypto from "crypto";

export interface SensorFilterParams {
  search?: string;
  deviceId?: string;
  protocol?: string;
  status?: string;
  direction?: string;
}

/**
 * List flow sensors with device and interface metadata.
 */
export async function listSensors(filters: SensorFilterParams = {}) {
  const rows = await db
    .select({
      sensor: sensors,
      device: devices,
    })
    .from(sensors)
    .innerJoin(devices, eq(sensors.deviceId, devices.id))
    .orderBy(desc(sensors.createdAt));

  // Get all interfaces for name resolution
  const allInterfaces = await db.select().from(interfaces);

  let result = rows.map((r) => {
    const iface = r.sensor.ifIndex
      ? allInterfaces.find(
          (i) => i.deviceId === r.device.id && i.ifIndex === r.sensor.ifIndex
        )
      : null;

    return {
      ...r.sensor,
      deviceHostname: r.device.hostname,
      deviceManagementIp: r.device.managementIp,
      deviceVendor: r.device.vendor,
      deviceModel: r.device.model,
      interfaceName: iface?.ifName || (r.sensor.ifIndex ? `ifIndex ${r.sensor.ifIndex}` : "All Interfaces (Global)"),
      interfaceAlias: iface?.ifAlias || null,
    };
  });

  // Apply filters
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.deviceHostname.toLowerCase().includes(q) ||
        s.deviceManagementIp.toLowerCase().includes(q) ||
        (s.interfaceName && s.interfaceName.toLowerCase().includes(q))
    );
  }

  if (filters.deviceId && filters.deviceId !== "all") {
    result = result.filter((s) => s.deviceId === filters.deviceId);
  }

  if (filters.protocol && filters.protocol !== "all") {
    result = result.filter((s) => s.protocol === filters.protocol);
  }

  if (filters.status && filters.status !== "all") {
    result = result.filter((s) => s.status === filters.status);
  }

  if (filters.direction && filters.direction !== "all") {
    result = result.filter((s) => s.direction === filters.direction);
  }

  return result;
}

/**
 * Get detailed sensor information including status history.
 */
export async function getSensorDetail(sensorId: string) {
  const [row] = await db
    .select({
      sensor: sensors,
      device: devices,
    })
    .from(sensors)
    .innerJoin(devices, eq(sensors.deviceId, devices.id))
    .where(eq(sensors.id, sensorId))
    .limit(1);

  if (!row) return null;

  let iface = null;
  if (row.sensor.ifIndex) {
    const devIfaces = await db
      .select()
      .from(interfaces)
      .where(eq(interfaces.deviceId, row.device.id));
    iface = devIfaces.find((i) => i.ifIndex === row.sensor.ifIndex) || null;
  }

  const history = await db
    .select()
    .from(sensorStatusHistory)
    .where(eq(sensorStatusHistory.sensorId, sensorId))
    .orderBy(desc(sensorStatusHistory.changedAt));

  return {
    ...row.sensor,
    device: {
      id: row.device.id,
      hostname: row.device.hostname,
      managementIp: row.device.managementIp,
      vendor: row.device.vendor,
      model: row.device.model,
    },
    interface: iface,
    statusHistory: history,
  };
}

/**
 * Create a new flow sensor with duplicate prevention and dynamic registry synchronization.
 */
export async function createSensor(input: CreateSensorInput, user: SessionUser) {
  // 1. Verify device exists
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, input.deviceId))
    .limit(1);

  if (!device) {
    throw new Error(`Device ID '${input.deviceId}' not found`);
  }

  // 2. If ifIndex provided, verify it exists on device
  if (input.ifIndex !== null && input.ifIndex !== undefined) {
    const devInterfaces = await db
      .select()
      .from(interfaces)
      .where(
        and(
          eq(interfaces.deviceId, input.deviceId),
          eq(interfaces.ifIndex, input.ifIndex)
        )
      );
    if (devInterfaces.length === 0) {
      throw new Error(
        `Interface index ${input.ifIndex} does not belong to device '${device.hostname}'`
      );
    }
  }

  // 3. Duplicate prevention: Check if same device + ifIndex + protocol + port + direction exists
  const existingSensors = await db
    .select()
    .from(sensors)
    .where(eq(sensors.deviceId, input.deviceId));

  const isDuplicate = existingSensors.some(
    (s) =>
      s.protocol === input.protocol &&
      s.collectorPort === input.collectorPort &&
      s.direction === input.direction &&
      (s.ifIndex ?? null) === (input.ifIndex ?? null)
  );

  if (isDuplicate) {
    throw new Error(
      `Sensor duplikat: Konfigurasi protokol ${input.protocol.toUpperCase()} pada port ${input.collectorPort} dan interface terkait sudah terdaftar di router ini.`
    );
  }

  const now = new Date().toISOString();
  const sensorId = `sns-${crypto.randomUUID()}`;

  const initialStatus: SensorStatus = input.status || "waiting_for_flow";

  const newSensor = {
    id: sensorId,
    deviceId: input.deviceId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    protocol: input.protocol,
    collectorIp: input.collectorIp || "0.0.0.0",
    collectorPort: input.collectorPort || 2055,
    ifIndex: input.ifIndex ?? null,
    samplingRate: input.samplingRate || 1000,
    direction: input.direction || "both",
    status: initialStatus,
    lastFlowAt: null,
    totalFlowsReceived: 0,
    totalBytesReceived: 0,
    totalPacketsReceived: 0,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(sensors).values(newSensor);

  // 4. Record initial status history
  await db.insert(sensorStatusHistory).values({
    id: crypto.randomUUID(),
    sensorId,
    oldStatus: "none",
    newStatus: initialStatus,
    triggerReason: `Sensor created by ${user.username}`,
    changedAt: now,
  });

  // 5. Register in dynamic in-memory registry
  sensorRegistry.register({
    id: sensorId,
    deviceId: device.id,
    deviceHostname: device.hostname,
    exporterIp: device.managementIp,
    name: newSensor.name,
    protocol: newSensor.protocol as FlowProtocol,
    collectorIp: newSensor.collectorIp,
    collectorPort: newSensor.collectorPort,
    ifIndex: newSensor.ifIndex,
    samplingRate: newSensor.samplingRate,
    direction: newSensor.direction as FlowDirection,
    status: initialStatus,
    registeredAt: now,
  });

  // 6. Record audit log
  await recordAuditLog({
    userId: user.id,
    username: user.username,
    action: "create",
    targetEntity: "sensor",
    targetId: sensorId,
    diffJson: {
      name: newSensor.name,
      device: device.hostname,
      protocol: newSensor.protocol,
      port: newSensor.collectorPort,
      status: initialStatus,
    },
  });

  return newSensor;
}

/**
 * Update sensor configuration and state.
 */
export async function updateSensor(
  sensorId: string,
  input: UpdateSensorInput,
  user: SessionUser
) {
  const [existing] = await db
    .select()
    .from(sensors)
    .where(eq(sensors.id, sensorId))
    .limit(1);

  if (!existing) {
    throw new Error("Sensor not found");
  }

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, existing.deviceId))
    .limit(1);

  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    updatedAt: now,
  };

  if (input.name !== undefined) updatePayload.name = input.name.trim();
  if (input.description !== undefined) updatePayload.description = input.description?.trim() || null;
  if (input.protocol !== undefined) updatePayload.protocol = input.protocol;
  if (input.collectorIp !== undefined) updatePayload.collectorIp = input.collectorIp;
  if (input.collectorPort !== undefined) updatePayload.collectorPort = input.collectorPort;
  if (input.ifIndex !== undefined) updatePayload.ifIndex = input.ifIndex;
  if (input.samplingRate !== undefined) updatePayload.samplingRate = input.samplingRate;
  if (input.direction !== undefined) updatePayload.direction = input.direction;

  // Handle status transition
  if (input.status !== undefined && input.status !== existing.status) {
    updatePayload.status = input.status;

    await db.insert(sensorStatusHistory).values({
      id: crypto.randomUUID(),
      sensorId,
      oldStatus: existing.status,
      newStatus: input.status,
      triggerReason: `Status updated to '${input.status}' by ${user.username}`,
      changedAt: now,
    });
  }

  await db.update(sensors).set(updatePayload).where(eq(sensors.id, sensorId));

  const [updated] = await db
    .select()
    .from(sensors)
    .where(eq(sensors.id, sensorId))
    .limit(1);

  // Sync to dynamic registry
  if (device) {
    sensorRegistry.register({
      id: updated.id,
      deviceId: device.id,
      deviceHostname: device.hostname,
      exporterIp: device.managementIp,
      name: updated.name,
      protocol: updated.protocol as FlowProtocol,
      collectorIp: updated.collectorIp,
      collectorPort: updated.collectorPort,
      ifIndex: updated.ifIndex,
      samplingRate: updated.samplingRate,
      direction: updated.direction as FlowDirection,
      status: updated.status as SensorStatus,
      registeredAt: now,
    });
  }

  // Audit log
  await recordAuditLog({
    userId: user.id,
    username: user.username,
    action: "update",
    targetEntity: "sensor",
    targetId: sensorId,
    diffJson: {
      fieldsChanged: Object.keys(updatePayload),
      oldStatus: existing.status,
      newStatus: updated.status,
    },
  });

  return updated;
}

/**
 * Toggle sensor between enabled (waiting_for_flow) and disabled.
 */
export async function toggleSensorState(
  sensorId: string,
  enable: boolean,
  user: SessionUser
) {
  const targetStatus = enable ? "waiting_for_flow" : "disabled";
  return updateSensor(
    sensorId,
    { status: targetStatus },
    user
  );
}

/**
 * Delete a flow sensor and unregister from dynamic collector table.
 */
export async function deleteSensor(sensorId: string, user: SessionUser) {
  const [existing] = await db
    .select()
    .from(sensors)
    .where(eq(sensors.id, sensorId))
    .limit(1);

  if (!existing) {
    throw new Error("Sensor not found");
  }

  // Unregister from dynamic registry
  sensorRegistry.unregister(sensorId);

  // Delete record (cascade deletes sensorStatusHistory)
  await db.delete(sensors).where(eq(sensors.id, sensorId));

  // Audit log
  await recordAuditLog({
    userId: user.id,
    username: user.username,
    action: "delete",
    targetEntity: "sensor",
    targetId: sensorId,
    diffJson: {
      name: existing.name,
      protocol: existing.protocol,
      port: existing.collectorPort,
    },
  });

  return { success: true, message: `Sensor '${existing.name}' deleted successfully` };
}

