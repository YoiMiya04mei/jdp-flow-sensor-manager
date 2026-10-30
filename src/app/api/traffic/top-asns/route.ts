import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { asnEnrichmentService } from "@/server/asn/asn-enrichment-service";
import { resolveTimePreset } from "@/server/analytics/traffic-query-service";
import type { FlowQueryParams } from "@/server/analytics/types";

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

    const preset = searchParams.get("preset");
    let startTime: number | undefined;
    let endTime: number | undefined;

    if (preset) {
      const resolved = resolveTimePreset(preset);
      startTime = resolved.startTime;
      endTime = resolved.endTime;
    } else {
      const s = searchParams.get("startTime");
      const e = searchParams.get("endTime");
      if (s) startTime = parseInt(s, 10);
      if (e) endTime = parseInt(e, 10);
    }

    const deviceId = searchParams.get("deviceId") || undefined;
    const sensorId = searchParams.get("sensorId") || undefined;
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? Math.min(50, Math.max(1, parseInt(limitStr, 10))) : 15;

    const params: FlowQueryParams = {
      startTime,
      endTime,
      deviceId,
      sensorId,
    };

    const topAsns = await asnEnrichmentService.getTopAsns(params, limit);
    const coverage = asnEnrichmentService.getCoverageStats();

    return NextResponse.json({
      success: true,
      data: {
        ...topAsns,
        coverage,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/traffic/top-asns error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

