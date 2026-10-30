import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { canPerformMutation } from "@/server/auth/rbac";
import { listSensors, createSensor } from "@/server/sensors/sensor-service";
import { createSensorSchema } from "@/lib/validations/sensor";

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
    const filters = {
      search: searchParams.get("search") || undefined,
      deviceId: searchParams.get("deviceId") || undefined,
      protocol: searchParams.get("protocol") || undefined,
      status: searchParams.get("status") || undefined,
      direction: searchParams.get("direction") || undefined,
    };

    const data = await listSensors(filters);

    return NextResponse.json({
      success: true,
      data: {
        sensors: data,
        total: data.length,
      },
    });
  } catch (err: any) {
    console.error("GET /api/sensors error:", err);
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
        { success: false, error: "Forbidden: Read-only Analyst cannot create sensors" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createSensorSchema.safeParse(body);

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

    const sensor = await createSensor(parsed.data, user);

    return NextResponse.json(
      {
        success: true,
        data: {
          sensor,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/sensors error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 400 }
    );
  }
}

