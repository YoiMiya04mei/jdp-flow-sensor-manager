import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { canPerformMutation } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { devices, interfaces, sensors } from "@/server/db/schema";
import { createDeviceSchema } from "@/lib/validations/device";
import { encryptSecret, redactDeviceSecrets } from "@/server/auth/crypto";
import { recordAuditLog } from "@/server/audit/audit-service";
import { eq, or, like, desc } from "drizzle-orm";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim().toLowerCase();
    const vendor = searchParams.get("vendor");
    const role = searchParams.get("role");
    const status = searchParams.get("status");

    const allDevices = await db
      .select()
      .from(devices)
      .orderBy(desc(devices.createdAt));

    // Filter in-memory for flexible multi-criteria search
    let filtered = allDevices;
    if (search) {
      filtered = filtered.filter(
        (d) =>
          d.hostname.toLowerCase().includes(search) ||
          d.managementIp.toLowerCase().includes(search) ||
          (d.asnName && d.asnName.toLowerCase().includes(search)) ||
          (d.locationSite && d.locationSite.toLowerCase().includes(search))
      );
    }
    if (vendor && vendor !== "all") {
      filtered = filtered.filter((d) => d.vendor === vendor);
    }
    if (role && role !== "all") {
      filtered = filtered.filter((d) => d.role === role);
    }
    if (status && status !== "all") {
      filtered = filtered.filter((d) => d.status === status);
    }

    // Fetch counts of interfaces and sensors for each device
    const allInterfaces = await db.select().from(interfaces);
    const allSensors = await db.select().from(sensors);

    const data = filtered.map((d) => {
      const devInterfaces = allInterfaces.filter((i) => i.deviceId === d.id);
      const devSensors = allSensors.filter((s) => s.deviceId === d.id);
      const redacted = redactDeviceSecrets(d);
      return {
        ...redacted,
        interfaceCount: devInterfaces.length,
        sensorCount: devSensors.length,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        devices: data,
        total: data.length,
      },
    });
  } catch (err: any) {
    console.error("GET /api/devices error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    // RBAC: Analyst cannot create
    if (!canPerformMutation(user.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Read-only Analyst cannot add devices" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createDeviceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check duplicate hostname
    const existingHost = await db
      .select()
      .from(devices)
      .where(eq(devices.hostname, data.hostname))
      .limit(1);

    if (existingHost.length > 0) {
      return NextResponse.json(
        { success: false, error: `Hostname '${data.hostname}' sudah terdaftar` },
        { status: 409 }
      );
    }

    // Check duplicate IP
    const existingIp = await db
      .select()
      .from(devices)
      .where(eq(devices.managementIp, data.managementIp))
      .limit(1);

    if (existingIp.length > 0) {
      return NextResponse.json(
        { success: false, error: `Management IP '${data.managementIp}' sudah terdaftar` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const deviceId = `dev-${crypto.randomUUID()}`;

    // Encrypt sensitive SNMP credentials if provided
    let snmpCommunityEncrypted: string | null = null;
    let snmpV3AuthPassEncrypted: string | null = null;
    let snmpV3PrivPassEncrypted: string | null = null;

    if (data.snmpEnabled) {
      if (data.snmpVersion === "v2c" && data.snmpCommunity) {
        snmpCommunityEncrypted = encryptSecret(data.snmpCommunity);
      } else if (data.snmpVersion === "v3") {
        if (data.snmpV3AuthPass) {
          snmpV3AuthPassEncrypted = encryptSecret(data.snmpV3AuthPass);
        }
        if (data.snmpV3PrivPass) {
          snmpV3PrivPassEncrypted = encryptSecret(data.snmpV3PrivPass);
        }
      }
    }

    const newDevice = {
      id: deviceId,
      hostname: data.hostname,
      managementIp: data.managementIp,
      vendor: data.vendor,
      model: data.model || null,
      role: data.role,
      asnNumber: data.asnNumber || null,
      asnName: data.asnName || null,
      locationSite: data.locationSite || null,
      snmpVersion: data.snmpVersion,
      snmpPort: data.snmpPort,
      snmpCommunityEncrypted,
      snmpV3User: data.snmpV3User || null,
      snmpV3AuthProto: data.snmpV3AuthProto || null,
      snmpV3AuthPassEncrypted,
      snmpV3PrivProto: data.snmpV3PrivProto || null,
      snmpV3PrivPassEncrypted,
      status: data.status,
      tags: data.tags || null,
      notes: data.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(devices).values(newDevice);

    // Record audit trail
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "create",
      targetEntity: "device",
      targetId: deviceId,
      diffJson: {
        hostname: data.hostname,
        managementIp: data.managementIp,
        vendor: data.vendor,
        role: data.role,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    const redacted = redactDeviceSecrets(newDevice);

    return NextResponse.json(
      {
        success: true,
        data: {
          device: redacted,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/devices error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

