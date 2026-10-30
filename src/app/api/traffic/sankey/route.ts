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

    const mode = (searchParams.get("mode") as "asn_to_asn" | "asn_to_customer") || "asn_to_asn";
    const metric = (searchParams.get("metric") as "bytes" | "packets" | "bps") || "bytes";
    const maxNodesStr = searchParams.get("maxNodes");
    const maxNodes = maxNodesStr ? Math.min(50, Math.max(5, parseInt(maxNodesStr, 10))) : 20;

    const deviceId = searchParams.get("deviceId") || undefined;
    const sensorId = searchParams.get("sensorId") || undefined;

    const params: FlowQueryParams = {
      startTime,
      endTime,
      deviceId,
      sensorId,
    };

    const graph = await asnEnrichmentService.getSankeyGraph(params, {
      mode,
      metric,
      maxNodes,
    });

    return NextResponse.json({
      success: true,
      data: graph,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/traffic/sankey error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

