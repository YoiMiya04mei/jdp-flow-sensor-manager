import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import {
  TrafficQueryService,
  resolveTimePreset,
} from "@/server/analytics/traffic-query-service";
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
    let bucketIntervalMs: number | undefined;

    if (preset) {
      const resolved = resolveTimePreset(preset);
      startTime = resolved.startTime;
      endTime = resolved.endTime;
      bucketIntervalMs = resolved.bucketIntervalMs;
    } else {
      const s = searchParams.get("startTime");
      const e = searchParams.get("endTime");
      if (s) startTime = parseInt(s, 10);
      if (e) endTime = parseInt(e, 10);
    }

    const customInterval = searchParams.get("intervalMs");
    if (customInterval) {
      bucketIntervalMs = parseInt(customInterval, 10);
    }

    const deviceId = searchParams.get("deviceId") || undefined;
    const sensorId = searchParams.get("sensorId") || undefined;

    const params: FlowQueryParams = {
      startTime,
      endTime,
      deviceId,
      sensorId,
    };

    const buckets = await TrafficQueryService.getTimeSeries(params, bucketIntervalMs);

    return NextResponse.json({
      success: true,
      data: {
        buckets,
        timeRangeStart: startTime,
        timeRangeEnd: endTime,
        bucketIntervalMs,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/traffic/timeseries error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

