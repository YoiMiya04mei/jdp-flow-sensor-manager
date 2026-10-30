import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import {
  TrafficQueryService,
  resolveTimePreset,
} from "@/server/analytics/traffic-query-service";
import type { FlowQueryParams, FlowSortColumn, FlowSortOrder } from "@/server/analytics/types";
import type { FlowProtocol } from "@/types";

const ALLOWED_SORT_COLUMNS: Set<FlowSortColumn> = new Set([
  "timestamp",
  "byteCount",
  "packetCount",
  "samplingAdjustedBytes",
  "srcIp",
  "dstIp",
  "srcPort",
  "dstPort",
]);

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

    // Time handling
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

    // Filters
    const search = searchParams.get("search") || undefined;
    const deviceId = searchParams.get("deviceId") || undefined;
    const sensorId = searchParams.get("sensorId") || undefined;
    const protocol = (searchParams.get("protocol") as FlowProtocol) || undefined;
    const ipVersionStr = searchParams.get("ipVersion");
    const ipVersion =
      ipVersionStr === "4" || ipVersionStr === "6"
        ? (parseInt(ipVersionStr, 10) as 4 | 6)
        : undefined;
    const portStr = searchParams.get("port");
    const port = portStr ? parseInt(portStr, 10) : undefined;
    const ipProtocolStr = searchParams.get("ipProtocol");
    const ipProtocol = ipProtocolStr ? parseInt(ipProtocolStr, 10) : undefined;

    // Sorting
    const sortByRaw = searchParams.get("sortBy") as FlowSortColumn;
    const sortBy = ALLOWED_SORT_COLUMNS.has(sortByRaw) ? sortByRaw : "timestamp";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : ("desc" as FlowSortOrder);

    // Pagination
    const limitStr = searchParams.get("limit");
    const offsetStr = searchParams.get("offset");
    const limit = limitStr ? Math.min(500, Math.max(1, parseInt(limitStr, 10))) : 50;
    const offset = offsetStr ? Math.max(0, parseInt(offsetStr, 10)) : 0;

    const params: FlowQueryParams = {
      startTime,
      endTime,
      search,
      deviceId,
      sensorId,
      protocol,
      ipVersion,
      port,
      ipProtocol,
      sortBy,
      sortOrder,
      limit,
      offset,
    };

    const result = await TrafficQueryService.queryFlowRecords(params);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/traffic/explorer error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

