import { NextResponse } from "next/server";
import { sqliteClient } from "@/server/db";
import { flowCollectorService } from "@/server/collector/flow-collector-service";
import { collectorTelemetry } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "ok";
  let foreignKeysOn = false;
  let errorDetail: string | null = null;

  // 1. Verify Database Connection and Foreign Keys
  try {
    const fkResult = await sqliteClient.execute("PRAGMA foreign_keys;");
    const val = fkResult.rows[0]?.[0];
    foreignKeysOn = val === 1 || val === 1n || val === "1";
    if (!foreignKeysOn) {
      dbStatus = "degraded_foreign_keys_disabled";
    }
  } catch (err: any) {
    dbStatus = "error";
    errorDetail = err?.message || String(err);
  }

  // 2. Check Collector State (Local or Daemon Heartbeat)
  let collectorState: string = flowCollectorService.getTelemetry().state;
  let lastHeartbeatIso: string | null = null;

  if (collectorState !== "running") {
    try {
      const [heartbeat] = await db
        .select()
        .from(collectorTelemetry)
        .where(eq(collectorTelemetry.id, "active_daemon"))
        .limit(1);

      if (heartbeat) {
        lastHeartbeatIso = heartbeat.updatedAt;
        const lastHeartbeatMs = new Date(heartbeat.updatedAt).getTime();
        const isFresh = Date.now() - lastHeartbeatMs < 15_000;
        if (heartbeat.state === "running" && isFresh) {
          collectorState = "running";
        } else {
          collectorState = heartbeat.state || "standby";
        }
      }
    } catch {
      // Table might not exist during pre-migration window
    }
  }

  const isHealthy = dbStatus === "ok" && foreignKeysOn;
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      environment: process.env.NODE_ENV || "development",
      uptime: Math.round(process.uptime()),
      storage: {
        engine: "sqlite-wal",
        status: dbStatus,
        foreignKeysActive: foreignKeysOn,
        retentionCap: 100_000,
      },
      collector: {
        state: collectorState,
        listenHost: process.env.FLOW_COLLECTOR_HOST || "0.0.0.0",
        ports: [2055, 6343, 9995],
        lastHeartbeat: lastHeartbeatIso,
      },
      guardrails: {
        routerLiveExecution: process.env.ROUTER_LIVE_EXECUTION_ENABLED === "true" ? "ENABLED" : "LOCKED (DEFAULT_DENY)",
        routerAdapter: process.env.ROUTER_ADAPTER_TYPE === "physical" ? "physical" : "mock-simulated",
        clickhouseActive: false,
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

