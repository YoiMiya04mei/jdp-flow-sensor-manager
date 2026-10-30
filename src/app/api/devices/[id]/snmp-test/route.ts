import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { testSnmpConnection } from "@/server/devices/snmp-service";
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

    const { id } = await params;
    const result = await testSnmpConnection(id);

    // Record audit event
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "test_snmp",
      targetEntity: "device",
      targetId: id,
      diffJson: {
        success: result.success,
        latencyMs: result.latencyMs,
        sysDescr: result.sysDescr || null,
        error: result.error || null,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    return NextResponse.json({
      success: result.success,
      data: result,
      error: result.error,
    });
  } catch (err: any) {
    console.error("POST /api/devices/[id]/snmp-test error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

