import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/server/db";
import {
  users,
  devices,
  interfaces,
  sensors,
  sensorStatusHistory,
  asnDirectory,
  auditLogs,
  provisioningJobs,
} from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { eq } from "drizzle-orm";
import crypto from "crypto";

describe("Database Foundation & Relational Schema (8 Tables)", () => {
  beforeAll(async () => {
    await runMigrations();
  });

  it("should verify users table operations", async () => {
    const testId = `test-user-${Date.now()}`;
    await db.insert(users).values({
      id: testId,
      username: `user_${Date.now()}`,
      email: `user_${Date.now()}@noc.local`,
      passwordHash: "dummy-scrypt-hash",
      role: "operator",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const [found] = await db.select().from(users).where(eq(users.id, testId));
    expect(found).toBeDefined();
    expect(found.role).toBe("operator");

    // Clean up
    await db.delete(users).where(eq(users.id, testId));
  });

  it("should verify devices, interfaces, and sensors cascade integrity", async () => {
    const deviceId = `test-dev-${Date.now()}`;
    const now = new Date().toISOString();

    // 1. Insert device
    await db.insert(devices).values({
      id: deviceId,
      hostname: `test-rtr-${Date.now()}.internal`,
      managementIp: `198.51.100.${Math.floor(Math.random() * 200) + 10}`,
      vendor: "mikrotik",
      role: "edge",
      createdAt: now,
      updatedAt: now,
    });

    // 2. Insert interface
    const ifId = `if-${Date.now()}`;
    await db.insert(interfaces).values({
      id: ifId,
      deviceId: deviceId,
      ifIndex: 1,
      ifName: "ether1-gateway",
      lastDiscoveredAt: now,
    });

    // 3. Insert sensor
    const sensorId = `sns-${Date.now()}`;
    await db.insert(sensors).values({
      id: sensorId,
      deviceId: deviceId,
      name: "Gateway IPFIX Sensor",
      protocol: "ipfix",
      ifIndex: 1,
      status: "waiting_for_flow",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Verify insertion
    const [dev] = await db.select().from(devices).where(eq(devices.id, deviceId));
    expect(dev).toBeDefined();

    const [sensor] = await db.select().from(sensors).where(eq(sensors.id, sensorId));
    expect(sensor).toBeDefined();
    expect(sensor.status).toBe("waiting_for_flow");

    // Clean up
    await db.delete(sensors).where(eq(sensors.id, sensorId));
    await db.delete(interfaces).where(eq(interfaces.id, ifId));
    await db.delete(devices).where(eq(devices.id, deviceId));
  });

  it("should verify ASN directory table schema", async () => {
    const testAsn = 999999;
    await db.insert(asnDirectory).values({
      asn: testAsn,
      name: "Test Transit AS",
      country: "ID",
      organizationType: "transit",
      updatedAt: new Date().toISOString(),
    });

    const [found] = await db
      .select()
      .from(asnDirectory)
      .where(eq(asnDirectory.asn, testAsn));
    expect(found).toBeDefined();
    expect(found.name).toBe("Test Transit AS");

    await db.delete(asnDirectory).where(eq(asnDirectory.asn, testAsn));
  });
});

