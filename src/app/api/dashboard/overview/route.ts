import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { devices, sensors } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    // 1. Device Counts
    const deviceCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(devices);
    const totalDevices = Number(deviceCountResult[0]?.count || 0);

    // 2. Sensor Counts by Status
    const allSensors = await db.select().from(sensors);
    const totalSensors = allSensors.length;

    const sensorsByStatus = {
      active: allSensors.filter((s) => s.status === "active").length,
      waiting: allSensors.filter((s) => s.status === "waiting_for_flow").length,
      stale: allSensors.filter((s) => s.status === "stale").length,
      error: allSensors.filter((s) => s.status === "error").length,
      draft: allSensors.filter((s) => s.status === "draft").length,
      disabled: allSensors.filter((s) => s.status === "disabled").length,
    };

    // 3. Collector status metadata
    const collectorStatus = {
      state: "ready",
      netflowPort: Number(process.env.NETFLOW_PORT || 2055),
      sflowPort: Number(process.env.SFLOW_PORT || 6343),
      mode: "dynamic_registry",
      message: "Ready to bind flow listener (Phase 4 integration target)",
    };

    // 4. Check if demo data is present
    const hasDemoTags = allSensors.some((s) => s.name.includes("[DEMO]"));

    return NextResponse.json({
      success: true,
      data: {
        totalDevices,
        totalSensors,
        sensorsByStatus,
        collectorStatus,
        isDemo: hasDemoTags,
      },
    });
  } catch (err: any) {
    console.error("Dashboard overview error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

