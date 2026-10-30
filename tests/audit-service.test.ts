import { describe, it, expect, beforeAll } from "vitest";
import { recordAuditLog } from "@/server/audit/audit-service";
import { db } from "@/server/db";
import { auditLogs, users } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { eq } from "drizzle-orm";

describe("Audit Logging Service", () => {
  const testUserId = `usr-audit-test-${Date.now()}`;

  beforeAll(async () => {
    await runMigrations();
    // Insert an existing user for foreign key integrity
    await db.insert(users).values({
      id: testUserId,
      username: `audit_tester_${Date.now()}`,
      email: `audit_tester_${Date.now()}@noc.local`,
      passwordHash: "dummy-hash",
      role: "operator",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("should record immutable audit log entries accurately", async () => {
    const targetId = `test-target-${Date.now()}`;
    await recordAuditLog({
      userId: testUserId,
      username: "operator_budi",
      action: "create_sensor",
      targetEntity: "sensor",
      targetId,
      diffJson: { protocol: "netflow_v9", port: 2055 },
      ipAddress: "10.10.10.50",
    });

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, targetId));

    expect(log).toBeDefined();
    expect(log.username).toBe("operator_budi");
    expect(log.action).toBe("create_sensor");
    expect(log.targetEntity).toBe("sensor");
    expect(log.diffJson).toContain("netflow_v9");
    expect(log.ipAddress).toBe("10.10.10.50");

    // Clean up
    await db.delete(auditLogs).where(eq(auditLogs.targetId, targetId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it("should support recording system audit logs with null userId", async () => {
    const targetId = `sys-target-${Date.now()}`;
    await recordAuditLog({
      userId: null,
      username: "system_collector",
      action: "reaper_stale_check",
      targetEntity: "sensor",
      targetId,
      diffJson: { status: "stale" },
      ipAddress: "127.0.0.1",
    });

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, targetId));

    expect(log).toBeDefined();
    expect(log.userId).toBeNull();
    expect(log.action).toBe("reaper_stale_check");

    // Clean up
    await db.delete(auditLogs).where(eq(auditLogs.targetId, targetId));
  });
});

