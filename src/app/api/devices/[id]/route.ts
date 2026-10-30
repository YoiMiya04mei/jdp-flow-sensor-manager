import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { isRoleAllowed } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { devices, interfaces, sensors } from "@/server/db/schema";
import { updateDeviceSchema } from "@/lib/validations/device";
import { encryptSecret, redactDeviceSecrets } from "@/server/auth/crypto";
import { recordAuditLog } from "@/server/audit/audit-service";
import { eq } from "drizzle-orm";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const [device] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    if (!device) {
      return NextResponse.json(
        { success: false, error: "Device not found" },
        { status: 404 }
      );
    }

    const devInterfaces = await db
      .select()
      .from(interfaces)
      .where(eq(interfaces.deviceId, id));

    const devSensors = await db
      .select()
      .from(sensors)
      .where(eq(sensors.deviceId, id));

    const redacted = redactDeviceSecrets(device);

    return NextResponse.json({
      success: true,
      data: {
        device: redacted,
        interfaces: devInterfaces,
        sensors: devSensors,
      },
    });
  } catch (err: any) {
    console.error("GET /api/devices/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    // RBAC: Only Admin and NetEng can modify devices
    if (!isRoleAllowed(user.role, ["admin", "neteng"])) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Role '${user.role}' cannot update device configurations`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const [existing] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Device not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateDeviceSchema.safeParse(body);

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

    // Check unique constraints if hostname or IP changed
    if (data.hostname && data.hostname !== existing.hostname) {
      const dupHost = await db
        .select()
        .from(devices)
        .where(eq(devices.hostname, data.hostname))
        .limit(1);
      if (dupHost.length > 0) {
        return NextResponse.json(
          { success: false, error: `Hostname '${data.hostname}' sudah digunakan` },
          { status: 409 }
        );
      }
    }

    if (data.managementIp && data.managementIp !== existing.managementIp) {
      const dupIp = await db
        .select()
        .from(devices)
        .where(eq(devices.managementIp, data.managementIp))
        .limit(1);
      if (dupIp.length > 0) {
        return NextResponse.json(
          { success: false, error: `Management IP '${data.managementIp}' sudah digunakan` },
          { status: 409 }
        );
      }
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.hostname !== undefined) updatePayload.hostname = data.hostname;
    if (data.managementIp !== undefined) updatePayload.managementIp = data.managementIp;
    if (data.vendor !== undefined) updatePayload.vendor = data.vendor;
    if (data.model !== undefined) updatePayload.model = data.model;
    if (data.role !== undefined) updatePayload.role = data.role;
    if (data.asnNumber !== undefined) updatePayload.asnNumber = data.asnNumber;
    if (data.asnName !== undefined) updatePayload.asnName = data.asnName;
    if (data.locationSite !== undefined) updatePayload.locationSite = data.locationSite;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.tags !== undefined) updatePayload.tags = data.tags;
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.snmpVersion !== undefined) updatePayload.snmpVersion = data.snmpVersion;
    if (data.snmpPort !== undefined) updatePayload.snmpPort = data.snmpPort;

    // Handle credential updates securely
    if (data.changeSnmpCredentials) {
      if (data.snmpCommunity) {
        updatePayload.snmpCommunityEncrypted = encryptSecret(data.snmpCommunity);
      }
      if (data.snmpV3User !== undefined) updatePayload.snmpV3User = data.snmpV3User;
      if (data.snmpV3AuthProto !== undefined) updatePayload.snmpV3AuthProto = data.snmpV3AuthProto;
      if (data.snmpV3AuthPass) {
        updatePayload.snmpV3AuthPassEncrypted = encryptSecret(data.snmpV3AuthPass);
      }
      if (data.snmpV3PrivProto !== undefined) updatePayload.snmpV3PrivProto = data.snmpV3PrivProto;
      if (data.snmpV3PrivPass) {
        updatePayload.snmpV3PrivPassEncrypted = encryptSecret(data.snmpV3PrivPass);
      }
    }

    await db.update(devices).set(updatePayload).where(eq(devices.id, id));

    // Audit log
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "update",
      targetEntity: "device",
      targetId: id,
      diffJson: {
        fieldsChanged: Object.keys(updatePayload).filter((k) => !k.includes("Encrypted")),
      },
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    const [updated] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        device: redactDeviceSecrets(updated),
      },
    });
  } catch (err: any) {
    console.error("PATCH /api/devices/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    // RBAC: Only Admin and NetEng can delete devices
    if (!isRoleAllowed(user.role, ["admin", "neteng"])) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Role '${user.role}' cannot delete devices`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const [existing] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Device not found" },
        { status: 404 }
      );
    }

    // Check attached sensors count
    const attachedSensors = await db
      .select()
      .from(sensors)
      .where(eq(sensors.deviceId, id));

    // Delete device (cascade deletes interfaces and sensors in SQLite/schema)
    await db.delete(devices).where(eq(devices.id, id));

    // Audit log
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "delete",
      targetEntity: "device",
      targetId: id,
      diffJson: {
        hostname: existing.hostname,
        managementIp: existing.managementIp,
        cascadeSensorsCount: attachedSensors.length,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    return NextResponse.json({
      success: true,
      message: `Device '${existing.hostname}' and ${attachedSensors.length} associated sensor(s) deleted successfully`,
    });
  } catch (err: any) {
    console.error("DELETE /api/devices/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

