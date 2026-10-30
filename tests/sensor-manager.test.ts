import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/server/db";
import { devices, interfaces, sensors, sensorStatusHistory, users } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createSensorSchema } from "@/lib/validations/sensor";
import {
  createSensor,
  updateSensor,
  toggleSensorState,
  deleteSensor,
  listSensors,
  getSensorDetail,
} from "@/server/sensors/sensor-service";
import { sensorRegistry } from "@/server/sensors/sensor-registry";
import { canPerformMutation, isRoleAllowed } from "@/server/auth/rbac";
import type { SessionUser, UserRole } from "@/types";
import { eq } from "drizzle-orm";

describe("Phase 3: Flow Sensor Manager & Dynamic Registry", () => {
  const adminUser: SessionUser = {
    id: "usr-p3-admin",
    username: "admin_sensor",
    email: "admin_sensor@noc.local",
    role: "admin",
  };

  const analystUser: SessionUser = {
    id: "usr-p3-analyst",
    username: "analyst_sensor",
    email: "analyst_sensor@noc.local",
    role: "analyst",
  };

  const testDeviceId = `dev-sensor-test-${Date.now()}`;
  const testIfIndex = 101;

  beforeAll(async () => {
    await runMigrations();

    const devIp = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    await db.delete(devices).where(eq(devices.managementIp, devIp));

    // 1. Ensure test device exists
    await db.insert(devices).values({
      id: testDeviceId,
      hostname: `sensor-host-${Date.now()}.noc`,
      managementIp: devIp,
      vendor: "juniper",
      role: "edge",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Ensure test interface exists
    await db.insert(interfaces).values({
      id: `if-sensor-test-${Date.now()}`,
      deviceId: testDeviceId,
      ifIndex: testIfIndex,
      ifName: "xe-0/0/0",
      ifAlias: "Uplink Transit",
      ifSpeed: 10000000000,
      ifOperStatus: "up",
      lastDiscoveredAt: new Date().toISOString(),
    });

    // Ensure test admin user exists in DB
    const existing = await db.select().from(users).where(eq(users.id, adminUser.id));
    if (existing.length === 0) {
      await db.insert(users).values({
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        passwordHash: "dummy-hash",
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  describe("Validation & Uniqueness Rules", () => {
    it("should validate input schema and reject invalid ports or negative sampling rates", () => {
      const valid = createSensorSchema.safeParse({
        name: "Test NetFlow v9 Sensor",
        deviceId: testDeviceId,
        protocol: "netflow_v9",
        collectorPort: 2055,
        samplingRate: 1000,
        direction: "both",
      });
      expect(valid.success).toBe(true);

      const invalidPort = createSensorSchema.safeParse({
        name: "Bad Port Sensor",
        deviceId: testDeviceId,
        protocol: "netflow_v9",
        collectorPort: 70000, // Exceeds 65535
      });
      expect(invalidPort.success).toBe(false);

      const negativeSampling = createSensorSchema.safeParse({
        name: "Bad Sampling",
        deviceId: testDeviceId,
        protocol: "ipfix",
        samplingRate: 0, // Must be >= 1
      });
      expect(negativeSampling.success).toBe(false);
    });

    it("should reject interface index that does not belong to the device", async () => {
      const nonExistentIfIndex = 99999;
      await expect(
        createSensor(
          {
            name: "Orphan Interface Sensor",
            deviceId: testDeviceId,
            protocol: "netflow_v9",
            collectorPort: 2055,
            collectorIp: "0.0.0.0",
            ifIndex: nonExistentIfIndex,
            samplingRate: 1000,
            direction: "both",
            status: "waiting_for_flow",
          },
          adminUser
        )
      ).rejects.toThrow(/does not belong to device/i);
    });
  });

  describe("Sensor Lifecycle State Machine & History", () => {
    let createdSensorId: string;

    it("should create sensor with initial status 'waiting_for_flow' and record history", async () => {
      const sensor = await createSensor(
        {
          name: "Edge Uplink IPFIX",
          deviceId: testDeviceId,
          protocol: "ipfix",
          collectorPort: 2055,
          collectorIp: "0.0.0.0",
          ifIndex: testIfIndex,
          samplingRate: 1000,
          direction: "ingress",
          status: "waiting_for_flow",
        },
        adminUser
      );

      createdSensorId = sensor.id;
      expect(sensor.id).toBeDefined();
      expect(sensor.status).toBe("waiting_for_flow"); // NOT automatically active!

      // Check status history entry
      const history = await db
        .select()
        .from(sensorStatusHistory)
        .where(eq(sensorStatusHistory.sensorId, sensor.id));

      expect(history.length).toBe(1);
      expect(history[0].newStatus).toBe("waiting_for_flow");
      expect(history[0].oldStatus).toBe("none");
    });

    it("should prevent duplicate sensor creation on identical device + interface + protocol + port + direction", async () => {
      await expect(
        createSensor(
          {
            name: "Duplicate Sensor Attempt",
            deviceId: testDeviceId,
            protocol: "ipfix",
            collectorPort: 2055,
            collectorIp: "0.0.0.0",
            ifIndex: testIfIndex,
            samplingRate: 2000,
            direction: "ingress",
            status: "waiting_for_flow",
          },
          adminUser
        )
      ).rejects.toThrow(/duplikat/i);
    });

    it("should toggle sensor state to 'disabled' and record status history transition", async () => {
      const updated = await toggleSensorState(createdSensorId, false, adminUser);
      expect(updated.status).toBe("disabled");

      const history = await db
        .select()
        .from(sensorStatusHistory)
        .where(eq(sensorStatusHistory.sensorId, createdSensorId));

      expect(history.length).toBe(2);
      expect(history[1].oldStatus).toBe("waiting_for_flow");
      expect(history[1].newStatus).toBe("disabled");
    });

    it("should re-enable sensor and transition to 'waiting_for_flow'", async () => {
      const updated = await toggleSensorState(createdSensorId, true, adminUser);
      expect(updated.status).toBe("waiting_for_flow");

      const history = await db
        .select()
        .from(sensorStatusHistory)
        .where(eq(sensorStatusHistory.sensorId, createdSensorId));

      expect(history.length).toBe(3);
      expect(history[2].oldStatus).toBe("disabled");
      expect(history[2].newStatus).toBe("waiting_for_flow");

      // Clean up
      await deleteSensor(createdSensorId, adminUser);
    });
  });

  describe("Dynamic Collector Registry (Zero Manual Config)", () => {
    it("should dynamically register sensor in memory lookup without config file edit", async () => {
      const sensor = await createSensor(
        {
          name: "Dynamic Registry Test Sensor",
          deviceId: testDeviceId,
          protocol: "netflow_v9",
          collectorPort: 2055,
          collectorIp: "0.0.0.0",
          ifIndex: testIfIndex,
          samplingRate: 1000,
          direction: "both",
          status: "waiting_for_flow",
        },
        adminUser
      );

      // Verify device details
      const [device] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, testDeviceId));

      // Test O(1) dynamic registry lookup
      const found = sensorRegistry.lookupSensor(
        device.managementIp,
        2055,
        testIfIndex
      );

      expect(found).toBeDefined();
      expect(found?.id).toBe(sensor.id);
      expect(found?.protocol).toBe("netflow_v9");
      expect(found?.exporterIp).toBe(device.managementIp);

      // Clean up
      await deleteSensor(sensor.id, adminUser);

      // Verify unregistered from dynamic lookup table
      const afterDelete = sensorRegistry.lookupSensor(
        device.managementIp,
        2055,
        testIfIndex
      );
      expect(afterDelete).toBeUndefined();
    });

    it("should return transparent collector readiness status", async () => {
      const status = await sensorRegistry.getRegistryStatus();
      expect(status.collectorState).toBe("STANDBY");
      expect(status.collectorMessage).toContain("Phase 3");
    });
  });

  describe("RBAC Authorization & Regression", () => {
    it("should strictly enforce read-only for Analyst role on sensor mutations", () => {
      expect(canPerformMutation(adminUser.role)).toBe(true);
      expect(canPerformMutation(analystUser.role)).toBe(false);

      const allowedForSensorConfig: UserRole[] = ["admin", "neteng"];
      expect(isRoleAllowed("admin", allowedForSensorConfig)).toBe(true);
      expect(isRoleAllowed("neteng", allowedForSensorConfig)).toBe(true);
      expect(isRoleAllowed("operator", allowedForSensorConfig)).toBe(false);
      expect(isRoleAllowed("analyst", allowedForSensorConfig)).toBe(false);
    });

    it("should verify cascade deletion when parent device is deleted", async () => {
      const tempDeviceId = `dev-cascade-${Date.now()}`;
      const cascadeIp = `198.51.101.${Math.floor(Math.random() * 250) + 1}`;
      await db.delete(devices).where(eq(devices.managementIp, cascadeIp));

      await db.insert(devices).values({
        id: tempDeviceId,
        hostname: `cascade-test-${Date.now()}`,
        managementIp: cascadeIp,
        vendor: "cisco",
        role: "edge",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const sensor = await createSensor(
        {
          name: "Cascade Test Sensor",
          deviceId: tempDeviceId,
          protocol: "sflow_v5",
          collectorPort: 6343,
          collectorIp: "0.0.0.0",
          samplingRate: 1000,
          direction: "both",
          status: "waiting_for_flow",
        },
        adminUser
      );

      // Delete parent device
      await db.delete(devices).where(eq(devices.id, tempDeviceId));

      // Sensor should be cascade deleted
      const orphanedSensor = await db
        .select()
        .from(sensors)
        .where(eq(sensors.id, sensor.id));
      expect(orphanedSensor.length).toBe(0);

      // Status history should also be cascade deleted
      const orphanedHistory = await db
        .select()
        .from(sensorStatusHistory)
        .where(eq(sensorStatusHistory.sensorId, sensor.id));
      expect(orphanedHistory.length).toBe(0);
    });
  });
});

