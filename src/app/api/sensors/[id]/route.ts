import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { isRoleAllowed } from "@/server/auth/rbac";
import {
  getSensorDetail,
  updateSensor,
  deleteSensor,
} from "@/server/sensors/sensor-service";
import { updateSensorSchema } from "@/lib/validations/sensor";

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
    const sensor = await getSensorDetail(id);

    if (!sensor) {
      return NextResponse.json(
        { success: false, error: "Sensor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sensor,
      },
    });
  } catch (err: any) {
    console.error("GET /api/sensors/[id] error:", err);
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

    // RBAC: Only Admin and NetEng can modify sensors
    if (!isRoleAllowed(user.role, ["admin", "neteng"])) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Role '${user.role}' cannot update sensor configuration`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateSensorSchema.safeParse(body);

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

    const updated = await updateSensor(id, parsed.data, user);

    return NextResponse.json({
      success: true,
      data: {
        sensor: updated,
      },
    });
  } catch (err: any) {
    console.error("PATCH /api/sensors/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 400 }
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

    // RBAC: Only Admin and NetEng can delete sensors
    if (!isRoleAllowed(user.role, ["admin", "neteng"])) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: Role '${user.role}' cannot delete sensors`,
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await deleteSensor(id, user);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("DELETE /api/sensors/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 400 }
    );
  }
}

