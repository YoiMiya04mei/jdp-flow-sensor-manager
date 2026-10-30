import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { flowCollectorService } from "@/server/collector/flow-collector-service";
import { sensorRegistry } from "@/server/sensors/sensor-registry";
import { analyticsStore } from "@/server/analytics/analytics-store";
import { db } from "@/server/db";
import { collectorTelemetry } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    let telemetry = flowCollectorService.getTelemetry();

    // If local process collector is not running, query shared SQLite heartbeat
    // from the external collector daemon process (multi-process integration)
    if (telemetry.state !== "running") {
      const [heartbeat] = await db
        .select()
        .from(collectorTelemetry)
        .where(eq(collectorTelemetry.id, "active_daemon"))
        .limit(1);

      if (heartbeat && heartbeat.state === "running") {
        const lastHeartbeatMs = new Date(heartbeat.updatedAt).getTime();
        const isFresh = Date.now() - lastHeartbeatMs < 10_000;
        if (isFresh) {
          let parsedPorts: any[] = [];
          try {
            parsedPorts = JSON.parse(heartbeat.portsJson);
          } catch {}
          let parsedErrors = {};
          try {
            parsedErrors = JSON.parse(heartbeat.parseErrorsJson || "{}");
          } catch {}
          let parsedTemplate = {};
          try {
            parsedTemplate = JSON.parse(heartbeat.templateStatsJson || "{}");
          } catch {}

          telemetry = {
            state: "running",
            listenHost: heartbeat.listenHost,
            ports: parsedPorts,
            packetsReceived: heartbeat.packetsReceived,
            packetsValid: heartbeat.packetsValid,
            packetsMalformed: heartbeat.packetsMalformed,
            packetsUnsupported: heartbeat.packetsUnsupported,
            flowsParsed: heartbeat.flowsParsed,
            flowsMatched: heartbeat.flowsMatched,
            unknownExporters: heartbeat.unknownExporters,
            parseErrorsByProtocol: parsedErrors as any,
            templateCacheStats: parsedTemplate as any,
            lastPacketReceivedAt: heartbeat.lastPacketAt,
            startedAt: heartbeat.startedAt,
          };
        }
      }
    }

    const registryStatus = await sensorRegistry.getRegistryStatus(
      telemetry.state === "running" ? "RUNNING" : telemetry.state === "error" ? "ERROR" : "STANDBY",
      telemetry.state === "running"
        ? `UDP Ingestion active on ports ${telemetry.ports.filter((p) => p.bound).map((p) => p.port).join(", ")}`
        : "Collector listener standby (Run 'npm run collector' to start ingestion daemon)"
    );
    const storeStats = analyticsStore.getStats();

    return NextResponse.json({
      success: true,
      data: {
        collector: telemetry,
        registry: registryStatus,
        analyticsStore: storeStats,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/collector/status error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

