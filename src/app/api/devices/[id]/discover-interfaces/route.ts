import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { isRoleAllowed } from "@/server/auth/rbac";
import { discoverDeviceInterfaces } from "@/server/devices/snmp-service";
import { recordAuditLog } from "@/server/audit/audit-service";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    // RBAC: Only Admin and NetEng can trigger interface discovery
    if (!isRoleAllowed(user.role, ["admin", "neteng"])) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Role '${user.role}' cannot run SNMP interface discovery`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await discoverDeviceInterfaces(id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Interface discovery failed" },
        { status: 400 }
      );
    }

    // Record audit event
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "discover_interfaces",
      targetEntity: "device",
      targetId: id,
      diffJson: {
        interfacesDiscovered: result.interfacesCount,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    return NextResponse.json({
      success: true,
      data: {
        interfacesCount: result.interfacesCount,
        interfaces: result.interfaces,
      },
    });
  } catch (err: any) {
    console.error("POST /api/devices/[id]/discover-interfaces error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

