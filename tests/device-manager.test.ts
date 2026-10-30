import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/server/db";
import { devices, interfaces, sensors, users } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createDeviceSchema, isValidIpAddress } from "@/lib/validations/device";
import { encryptSecret, decryptSecret, redactDeviceSecrets } from "@/server/auth/crypto";
import {
  testSnmpConnection,
  discoverDeviceInterfaces,
  isIpRestrictedForSnmp,
} from "@/server/devices/snmp-service";
import { canPerformMutation, isRoleAllowed } from "@/server/auth/rbac";
import type { UserRole } from "@/types";
import { eq } from "drizzle-orm";
import crypto from "crypto";

describe("Phase 2: Device Manager & SNMP Integration", () => {
  const testAdminId = "usr-phase2-admin";

  beforeAll(async () => {
    await runMigrations();

    // Ensure test admin exists for audit integrity
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.id, testAdminId));
    if (existing.length === 0) {
      await db.insert(users).values({
        id: testAdminId,
        username: "admin_phase2",
        email: "admin2@noc.local",
        passwordHash: "dummy-hash",
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  describe("Validation & Duplicate Checking", () => {
    it("should correctly validate valid IPv4 and IPv6 addresses and reject malformed IPs", () => {
      expect(isValidIpAddress("10.200.0.1")).toBe(true);
      expect(isValidIpAddress("192.168.1.254")).toBe(true);
      expect(isValidIpAddress("2001:db8::1")).toBe(true);

      // Invalid IPs
      expect(isValidIpAddress("999.999.999.999")).toBe(false);
      expect(isValidIpAddress("invalid-ip-string")).toBe(false);
      expect(isValidIpAddress("10.0.0.")).toBe(false);
    });

    it("should validate device creation payload using Zod schema", () => {
      const validPayload = {
        hostname: "jkt-edge-rtr01",
        managementIp: "10.100.1.1",
        vendor: "juniper",
        model: "MX204",
        role: "edge",
        asnNumber: 7713,
        asnName: "PT Telkom Indonesia",
        snmpEnabled: true,
        snmpVersion: "v3",
        snmpPort: 161,
        snmpV3User: "snmp-admin",
        snmpV3AuthProto: "SHA256",
        snmpV3AuthPass: "AuthSecret123!",
        snmpV3PrivProto: "AES128",
        snmpV3PrivPass: "PrivSecret123!",
      };

      const parsed = createDeviceSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      // Invalid payload (invalid vendor and bad IP)
      const invalidPayload = {
        hostname: "bad!host name",
        managementIp: "not-an-ip",
        vendor: "unknown-vendor-xyz",
      };

      const invalidParsed = createDeviceSchema.safeParse(invalidPayload);
      expect(invalidParsed.success).toBe(false);
    });
  });

  describe("SNMP Credential Protection & Redaction", () => {
    it("should store encrypted credentials and redact them on API read", async () => {
      const testDeviceId = `dev-vault-${Date.now()}`;
      const now = new Date().toISOString();
      const rawCommunity = "secret-snmp-community-str";

      await db.insert(devices).values({
        id: testDeviceId,
        hostname: `vault-rtr-${Date.now()}`,
        managementIp: `10.250.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
        vendor: "huawei",
        role: "core",
        snmpVersion: "v2c",
        snmpPort: 161,
        snmpCommunityEncrypted: encryptSecret(rawCommunity),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const [stored] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, testDeviceId));

      expect(stored).toBeDefined();
      expect(stored.snmpCommunityEncrypted).not.toBe(rawCommunity);
      expect(decryptSecret(stored.snmpCommunityEncrypted!)).toBe(rawCommunity);

      // Verify redaction for API response
      const apiResponse = redactDeviceSecrets(stored);
      expect("snmpCommunityEncrypted" in apiResponse).toBe(false);
      expect(apiResponse.hasSnmpCommunity).toBe(true);

      // Clean up
      await db.delete(devices).where(eq(devices.id, testDeviceId));
    });
  });

  describe("SNMP Connection Test & SSRF Boundary", () => {
    it("should block SSRF restricted addresses from SNMP test", () => {
      expect(isIpRestrictedForSnmp("127.0.0.1")).toBe(true);
      expect(isIpRestrictedForSnmp("127.0.0.2")).toBe(true);
      expect(isIpRestrictedForSnmp("127.100.200.1")).toBe(true);
      expect(isIpRestrictedForSnmp("::ffff:127.0.0.1")).toBe(true);
      expect(isIpRestrictedForSnmp("localhost")).toBe(true);
      expect(isIpRestrictedForSnmp("169.254.169.254")).toBe(true);
      expect(isIpRestrictedForSnmp("::1")).toBe(true);
      expect(isIpRestrictedForSnmp("0:0:0:0:0:0:0:1")).toBe(true);
      expect(isIpRestrictedForSnmp("fe80::1")).toBe(true);
      expect(isIpRestrictedForSnmp("0.0.0.0")).toBe(true);

      // Allowed network IPs
      expect(isIpRestrictedForSnmp("10.200.0.1")).toBe(false);
      expect(isIpRestrictedForSnmp("198.51.100.1")).toBe(false);
    });

    it("should run isolated SNMP test and return latency & sysDescr", async () => {
      const testDeviceId = `dev-snmp-test-${Date.now()}`;
      const now = new Date().toISOString();

      await db.insert(devices).values({
        id: testDeviceId,
        hostname: `snmp-test-rtr-${Date.now()}`,
        managementIp: `198.51.100.${Math.floor(Math.random() * 200) + 10}`,
        vendor: "juniper",
        model: "MX480",
        role: "edge",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const result = await testSnmpConnection(testDeviceId);
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.sysDescr).toContain("Juniper Networks");

      // Clean up
      await db.delete(devices).where(eq(devices.id, testDeviceId));
    });
  });

  describe("Interface Discovery & Cascade Behavior", () => {
    it("should discover interfaces and persist them to interfaces table", async () => {
      const testDeviceId = `dev-iface-${Date.now()}`;
      const now = new Date().toISOString();

      await db.insert(devices).values({
        id: testDeviceId,
        hostname: `iface-rtr-${Date.now()}`,
        managementIp: `10.150.1.${Math.floor(Math.random() * 200) + 10}`,
        vendor: "mikrotik",
        model: "CCR2216",
        role: "edge",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const discovery = await discoverDeviceInterfaces(testDeviceId);
      expect(discovery.success).toBe(true);
      expect(discovery.interfacesCount).toBeGreaterThan(0);

      const dbInterfaces = await db
        .select()
        .from(interfaces)
        .where(eq(interfaces.deviceId, testDeviceId));

      expect(dbInterfaces.length).toBe(discovery.interfacesCount);
      expect(dbInterfaces[0].ifName).toBeDefined();
      expect(dbInterfaces[0].ifIndex).toBeGreaterThan(0);

      // Verify cascade delete: deleting device deletes interfaces
      await db.delete(devices).where(eq(devices.id, testDeviceId));

      const orphanedInterfaces = await db
        .select()
        .from(interfaces)
        .where(eq(interfaces.deviceId, testDeviceId));

      expect(orphanedInterfaces.length).toBe(0);
    });
  });

  describe("RBAC Permissions Enforcement", () => {
    it("should allow Admin and NetEng to mutate devices but block Analyst", () => {
      expect(canPerformMutation("admin")).toBe(true);
      expect(canPerformMutation("neteng")).toBe(true);
      expect(canPerformMutation("operator")).toBe(true);
      // Analyst is strictly read-only
      expect(canPerformMutation("analyst")).toBe(false);

      const allowedForDeviceConfig: UserRole[] = ["admin", "neteng"];
      expect(isRoleAllowed("admin", allowedForDeviceConfig)).toBe(true);
      expect(isRoleAllowed("neteng", allowedForDeviceConfig)).toBe(true);
      expect(isRoleAllowed("operator", allowedForDeviceConfig)).toBe(false);
      expect(isRoleAllowed("analyst", allowedForDeviceConfig)).toBe(false);
    });
  });
});
