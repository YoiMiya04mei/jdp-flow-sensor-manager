import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { isRoleAllowed } from "@/server/auth/rbac";
import { toggleSensorState } from "@/server/sensors/sensor-service";

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

    // RBAC: Only Admin and NetEng can toggle sensor state
    if (!isRoleAllowed(user.role, ["admin", "neteng"])) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Role '${user.role}' cannot change sensor state`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const enable = Boolean(body.enable);

    const updated = await toggleSensorState(id, enable, user);

    return NextResponse.json({
      success: true,
      data: {
        sensor: updated,
      },
    });
  } catch (err: any) {
    console.error("POST /api/sensors/[id]/toggle error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 400 }
    );
  }
}

