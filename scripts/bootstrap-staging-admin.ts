/**
 * JDP FLOW SENSOR MANAGER & TRAFFIC ANALYZER
 * Staging Administrator Bootstrap Utility
 * 
 * Creates an authorized staging administrator with custom non-demo credentials.
 * Used during staging deployment when ENABLE_DEV_SEED=false and demo seeding is prohibited.
 */

import { db } from "../src/server/db";
import { users } from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth/crypto";
import { runMigrations } from "../src/server/db/migrate";
import { recordAuditLog } from "../src/server/audit/audit-service";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function bootstrapStagingAdmin(options?: {
  username?: string;
  email?: string;
  password?: string;
}) {
  await runMigrations();

  const username = options?.username || process.env.STAGING_ADMIN_USERNAME || "staging_admin";
  const email = options?.email || process.env.STAGING_ADMIN_EMAIL || "staging.admin@jdp-noc.internal";
  const password =
    options?.password ||
    process.env.STAGING_ADMIN_PASSWORD ||
    `Stg#${crypto.randomBytes(6).toString("hex")}!`;

  const now = new Date().toISOString();

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing) {
    console.log(`[BOOTSTRAP] Administrator '${username}' already exists. Updating password...`);
    const passwordHash = hashPassword(password);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, existing.id));

    console.log(`[BOOTSTRAP] Administrator '${username}' updated successfully.`);
    return { id: existing.id, username, email, password, isNew: false };
  }

  const userId = `usr-stg-${Date.now()}`;
  const passwordHash = hashPassword(password);

  await db.insert(users).values({
    id: userId,
    username,
    email,
    passwordHash,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    userId,
    username,
    action: "STAGING_ADMIN_BOOTSTRAP",
    targetEntity: "users",
    targetId: userId,
    diffJson: { role: "admin", email, environment: "staging" },
    ipAddress: "127.0.0.1",
  });

  console.log("==================================================");
  console.log("  JDP NOC - Staging Admin Provisioning Complete   ");
  console.log("==================================================");
  console.log(`  Username: ${username}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Role:     admin`);
  console.log(`  Password: ${password}`);
  console.log("==================================================");

  return { id: userId, username, email, password, isNew: true };
}

if (require.main === module || process.argv[1]?.endsWith("bootstrap-staging-admin.ts")) {
  bootstrapStagingAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[BOOTSTRAP ERROR]", err);
      process.exit(1);
    });
}

