import { db } from "../src/server/db";
import { users } from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth/crypto";
import { eq } from "drizzle-orm";

async function main() {
  const now = new Date().toISOString();
  const demoPassword = "JdpDemoPassword2026!";
  const passwordHash = hashPassword(demoPassword);

  const demoUsers = [
    {
      id: "usr-demo-admin",
      username: "demo_admin",
      email: "demo.admin@jdp-noc.internal",
      passwordHash,
      role: "admin" as const,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "usr-demo-neteng",
      username: "demo_neteng",
      email: "demo.neteng@jdp-noc.internal",
      passwordHash,
      role: "neteng" as const,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "usr-demo-operator",
      username: "demo_operator",
      email: "demo.operator@jdp-noc.internal",
      passwordHash,
      role: "operator" as const,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "usr-demo-analyst",
      username: "demo_analyst",
      email: "demo.analyst@jdp-noc.internal",
      passwordHash,
      role: "analyst" as const,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const u of demoUsers) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, u.username));
    if (existing.length === 0) {
      await db.insert(users).values(u);
      console.log(`Inserted demo user: ${u.username}`);
    } else {
      await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, existing[0].id));
      console.log(`Updated demo user: ${u.username}`);
    }
  }

  console.log("Demo users ready!");
}

main().catch(console.error);

