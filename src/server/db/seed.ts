import { db } from "./index";
import { users, devices, sensors, asnDirectory, auditLogs } from "./schema";
import { hashPassword, encryptSecret } from "../auth/crypto";
import { runMigrations } from "./migrate";
import crypto from "crypto";
import { eq } from "drizzle-orm";

export async function seedDevelopmentData() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[FATAL SECURITY] Database seeding of demo/development accounts is strictly prohibited in production mode."
    );
    throw new Error(
      "Cannot seed development accounts in production environment."
    );
  }

  if (process.env.ENABLE_DEV_SEED !== "true") {
    console.log("Development seeding skipped (ENABLE_DEV_SEED is not 'true').");
    return;
  }

  console.log("Seeding development data with [DEMO] labels...");

  // Ensure tables exist
  await runMigrations();

  const now = new Date().toISOString();
  const demoPassword = "JdpDemoPassword2026!";
  const passwordHash = hashPassword(demoPassword);

  // 1. Seed RBAC Users (Demo accounts)
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
    }
  }

  // 2. Seed ASN Directory Reference
  const demoAsns = [
    { asn: 15169, name: "Google LLC", country: "US", organizationType: "content_cdn" as const },
    { asn: 13335, name: "Cloudflare, Inc.", country: "US", organizationType: "content_cdn" as const },
    { asn: 7713, name: "PT Telkom Indonesia", country: "ID", organizationType: "tier1" as const },
    { asn: 17974, name: "PT Telekomunikasi Selular (Telkomsel)", country: "ID", organizationType: "eyeball_isp" as const },
    { asn: 24203, name: "PT Cyberindo Aditama (CBN)", country: "ID", organizationType: "transit" as const },
    { asn: 23700, name: "PT Biznet Gio Nusantara", country: "ID", organizationType: "transit" as const },
  ];

  for (const a of demoAsns) {
    const existing = await db
      .select()
      .from(asnDirectory)
      .where(eq(asnDirectory.asn, a.asn));
    if (existing.length === 0) {
      await db.insert(asnDirectory).values({ ...a, updatedAt: now });
    }
  }

  // 3. Seed Demo Devices (clearly labeled [DEMO])
  const demoDeviceId = "dev-demo-core-01";
  const existingDev = await db
    .select()
    .from(devices)
    .where(eq(devices.id, demoDeviceId));

  if (existingDev.length === 0) {
    await db.insert(devices).values({
      id: demoDeviceId,
      hostname: "id-jkt-core-rtr01.noc.internal",
      managementIp: "10.200.0.1",
      vendor: "juniper",
      model: "MX480",
      role: "core",
      asnNumber: 7713,
      asnName: "PT Telkom Indonesia",
      locationSite: "IDC 3D Duren Tiga, Jakarta",
      snmpVersion: "v3",
      snmpPort: 161,
      snmpCommunityEncrypted: encryptSecret("jdp-demo-community-secret"),
      snmpV3User: "jdp-snmp-user",
      snmpV3AuthProto: "SHA256",
      snmpV3AuthPassEncrypted: encryptSecret("snmp-auth-secret-demo"),
      snmpV3PrivProto: "AES128",
      snmpV3PrivPassEncrypted: encryptSecret("snmp-priv-secret-demo"),
      status: "active",
      tags: "DEMO,CORE,JUNIPER,JAKARTA",
      notes: "[DEMO] Primary backbone core router for testing flow ingestion",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Seed Demo Sensor
    await db.insert(sensors).values({
      id: "sns-demo-01",
      deviceId: demoDeviceId,
      name: "[DEMO] Core Ingress Flow (xe-0/0/0)",
      protocol: "netflow_v9",
      collectorIp: "0.0.0.0",
      collectorPort: 2055,
      ifIndex: 501,
      samplingRate: 1000,
      direction: "ingress",
      status: "waiting_for_flow",
      totalFlowsReceived: 0,
      totalBytesReceived: 0,
      totalPacketsReceived: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 5. Seed Initial Audit Log
  const existingLogs = await db.select().from(auditLogs);
  if (existingLogs.length === 0) {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: "usr-demo-admin",
      username: "demo_admin",
      action: "system_init",
      targetEntity: "system",
      targetId: "jdp-app-root",
      diffJson: JSON.stringify({ message: "Initial Phase 1 system bootstrap and schema creation" }),
      ipAddress: "127.0.0.1",
      createdAt: now,
    });
  }

  console.log("Database seeded successfully with [DEMO] data!");
}

// Allow direct CLI execution: tsx src/server/db/seed.ts
if (require.main === module || process.argv[1]?.endsWith("seed.ts")) {
  seedDevelopmentData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

