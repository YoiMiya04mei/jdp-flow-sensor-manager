import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { canPerformMutation } from "@/server/auth/rbac";
import { provisioningService } from "@/server/provisioning/provisioning-service";

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
    const deviceId = searchParams.get("deviceId") || undefined;
    const vendor = searchParams.get("vendor") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    const data = await provisioningService.listJobs({
      deviceId,
      vendor,
      status,
      search,
    });

    return NextResponse.json({
      success: true,
      data,
      total: data.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list provisioning configurations." },
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

    // Analyst is strictly read-only
    if (!canPerformMutation(user.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Analyst role is strictly read-only." },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (!body.deviceId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter 'deviceId'." },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    const job = await provisioningService.createConfiguration(
      {
        title: body.title,
        deviceId: body.deviceId,
        sensorIds: body.sensorIds,
        targetInterfaceNames: body.targetInterfaceNames,
        templateId: body.templateId,
        exporterIp: body.exporterIp,
        collectorIp: body.collectorIp,
        collectorPort: body.collectorPort ? Number(body.collectorPort) : undefined,
        protocol: body.protocol,
        samplingRate: body.samplingRate ? Number(body.samplingRate) : undefined,
        direction: body.direction,
        mode: body.mode,
      },
      user,
      clientIp
    );

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate configuration." },
      { status: 400 }
    );
  }
}

