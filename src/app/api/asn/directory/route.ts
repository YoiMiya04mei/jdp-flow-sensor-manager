import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { asnEnrichmentService } from "@/server/asn/asn-enrichment-service";

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
    const search = searchParams.get("search") || undefined;
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? Math.min(100, Math.max(1, parseInt(limitStr, 10))) : 25;

    const items = await asnEnrichmentService.searchDirectory(search, limit);
    const coverage = asnEnrichmentService.getCoverageStats();

    return NextResponse.json({
      success: true,
      data: {
        items,
        coverage,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/asn/directory error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

