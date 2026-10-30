import { describe, it, expect, beforeAll } from "vitest";
import { db, sqliteClient, ensureDatabasePragmas } from "@/server/db";
import {
  devices,
  interfaces,
  sensors,
  sensorStatusHistory,
} from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { eq } from "drizzle-orm";

describe("SQLite Foreign Keys & Relational Integrity Verification", () => {
  beforeAll(async () => {
    await runMigrations();
  });

  it("should verify that PRAGMA foreign_keys is actively enabled (= 1)", async () => {
    const pragmaStatus = await ensureDatabasePragmas();
    expect(pragmaStatus.foreignKeys).toBe(true);

    const check = await sqliteClient.execute("PRAGMA foreign_keys;");
    const val = check.rows[0]?.[0];
    expect(Number(val)).toBe(1);
  });

  it("should reject inserting an interface referencing a non-existent device", async () => {
    const fakeDeviceId = `nonexistent-device-${Date.now()}`;
    const ifId = `orphan-if-${Date.now()}`;

    let errorCaught: any = null;
    try {
      await db.insert(interfaces).values({
        id: ifId,
        deviceId: fakeDeviceId,
        ifIndex: 99,
        ifName: "orphan-eth0",
        lastDiscoveredAt: new Date().toISOString(),
      });
    } catch (err) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    // LibSQL / SQLite throws constraint error when foreign_keys = ON
    const errString = String(errorCaught?.message || errorCaught);
    expect(
      errString.includes("FOREIGN KEY constraint failed") ||
      errString.includes("SQLITE_CONSTRAINT") ||
      errString.includes("constraint")
    ).toBe(true);

    // Ensure the orphan was not inserted
    const [orphan] = await db.select().from(interfaces).where(eq(interfaces.id, ifId));
    expect(orphan).toBeUndefined();
  });

  it("should reject inserting a sensor referencing a non-existent device", async () => {
    const fakeDeviceId = `nonexistent-device-${Date.now()}`;
    const sensorId = `orphan-sns-${Date.now()}`;

    let errorCaught: any = null;
    try {
      await db.insert(sensors).values({
        id: sensorId,
        deviceId: fakeDeviceId,
        name: "Orphan Sensor",
        protocol: "netflow_v9",
        status: "waiting_for_flow",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    const errString = String(errorCaught?.message || errorCaught);
    expect(
      errString.includes("FOREIGN KEY constraint failed") ||
      errString.includes("SQLITE_CONSTRAINT") ||
      errString.includes("constraint")
    ).toBe(true);

    const [orphan] = await db.select().from(sensors).where(eq(sensors.id, sensorId));
    expect(orphan).toBeUndefined();
  });

  it("should reject inserting sensor status history referencing a non-existent sensor", async () => {
    const fakeSensorId = `nonexistent-sensor-${Date.now()}`;
    const historyId = `orphan-hist-${Date.now()}`;

    let errorCaught: any = null;
    try {
      await db.insert(sensorStatusHistory).values({
        id: historyId,
        sensorId: fakeSensorId,
        oldStatus: "waiting_for_flow",
        newStatus: "active",
        triggerReason: "Orphan FK test",
        changedAt: new Date().toISOString(),
      });
    } catch (err) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    const errString = String(errorCaught?.message || errorCaught);
    expect(
      errString.includes("FOREIGN KEY constraint failed") ||
      errString.includes("SQLITE_CONSTRAINT") ||
      errString.includes("constraint")
    ).toBe(true);

    const [orphan] = await db.select().from(sensorStatusHistory).where(eq(sensorStatusHistory.id, historyId));
    expect(orphan).toBeUndefined();
  });

  it("should enforce ON DELETE CASCADE: deleting a parent device removes child interfaces and sensors", async () => {
    const testDeviceId = `test-cascade-dev-${Date.now()}`;
    const now = new Date().toISOString();

    // 1. Create parent device
    await db.insert(devices).values({
      id: testDeviceId,
      hostname: `cascade-rtr-${Date.now()}.noc.test`,
      managementIp: `198.51.100.${Math.floor(Math.random() * 200) + 10}`,
      vendor: "cisco",
      role: "edge",
      createdAt: now,
      updatedAt: now,
    });

    // 2. Create child interface
    const ifId1 = `cascade-if-${Date.now()}-1`;
    await db.insert(interfaces).values({
      id: ifId1,
      deviceId: testDeviceId,
      ifIndex: 10,
      ifName: "GigabitEthernet0/0/0",
      lastDiscoveredAt: now,
    });

    // 3. Create child sensor
    const sensorId1 = `cascade-sns-${Date.now()}-1`;
    await db.insert(sensors).values({
      id: sensorId1,
      deviceId: testDeviceId,
      name: "Cascade Test Sensor",
      protocol: "netflow_v9",
      ifIndex: 10,
      status: "waiting_for_flow",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create child sensor_status_history
    const historyId = `cascade-hist-${Date.now()}-1`;
    await db.insert(sensorStatusHistory).values({
      id: historyId,
      sensorId: sensorId1,
      oldStatus: "disabled",
      newStatus: "waiting_for_flow",
      triggerReason: "Initial creation test",
      changedAt: now,
    });

    // Verify all exist
    const [devBefore] = await db.select().from(devices).where(eq(devices.id, testDeviceId));
    const [ifBefore] = await db.select().from(interfaces).where(eq(interfaces.id, ifId1));
    const [snsBefore] = await db.select().from(sensors).where(eq(sensors.id, sensorId1));
    const [histBefore] = await db.select().from(sensorStatusHistory).where(eq(sensorStatusHistory.id, historyId));

    expect(devBefore).toBeDefined();
    expect(ifBefore).toBeDefined();
    expect(snsBefore).toBeDefined();
    expect(histBefore).toBeDefined();

    // 5. Delete parent device
    await db.delete(devices).where(eq(devices.id, testDeviceId));

    // 6. Verify parent device is gone
    const [devAfter] = await db.select().from(devices).where(eq(devices.id, testDeviceId));
    expect(devAfter).toBeUndefined();

    // 7. Verify cascade deleted child interface, sensor, and sensor status history
    const [ifAfter] = await db.select().from(interfaces).where(eq(interfaces.id, ifId1));
    expect(ifAfter).toBeUndefined();

    const [snsAfter] = await db.select().from(sensors).where(eq(sensors.id, sensorId1));
    expect(snsAfter).toBeUndefined();

    const [histAfter] = await db.select().from(sensorStatusHistory).where(eq(sensorStatusHistory.id, historyId));
    expect(histAfter).toBeUndefined();
  });
});
