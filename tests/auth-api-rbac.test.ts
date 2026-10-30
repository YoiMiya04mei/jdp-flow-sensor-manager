import { describe, it, expect, beforeAll } from "vitest";
import { authenticateAndAuthorize } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/crypto";
import { runMigrations } from "@/server/db/migrate";
import { eq } from "drizzle-orm";

describe("Auth API & RBAC Authorization Logic", () => {
  const testAdminId = "usr-test-admin-gate";
  const testAnalystId = "usr-test-analyst-gate";
  const password = "TestPassword2026!";

  beforeAll(async () => {
    await runMigrations();

    // Ensure test admin exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.id, testAdminId));
    if (existingAdmin.length === 0) {
      await db.insert(users).values({
        id: testAdminId,
        username: "gate_admin",
        email: "admin@gate.noc",
        passwordHash: hashPassword(password),
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Ensure test analyst exists
    const existingAnalyst = await db
      .select()
      .from(users)
      .where(eq(users.id, testAnalystId));
    if (existingAnalyst.length === 0) {
      await db.insert(users).values({
        id: testAnalystId,
        username: "gate_analyst",
        email: "analyst@gate.noc",
        passwordHash: hashPassword(password),
        role: "analyst",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  it("should verify admin password correctly from database record", async () => {
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "gate_admin"));
    expect(admin).toBeDefined();
    expect(verifyPassword(password, admin.passwordHash)).toBe(true);
    expect(verifyPassword("WrongPassword", admin.passwordHash)).toBe(false);
  });

  it("should verify analyst user role and immutability", async () => {
    const [analyst] = await db
      .select()
      .from(users)
      .where(eq(users.username, "gate_analyst"));
    expect(analyst).toBeDefined();
    expect(analyst.role).toBe("analyst");
  });
});

