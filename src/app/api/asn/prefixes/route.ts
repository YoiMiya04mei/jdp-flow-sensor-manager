import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { prefixMapping, asnDirectory } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

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
    const search = searchParams.get("search")?.trim().toLowerCase();
    const asnStr = searchParams.get("asn");
    const asn = asnStr ? parseInt(asnStr, 10) : undefined;
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const rows = await db
      .select({
        prefix: prefixMapping,
        orgName: asnDirectory.name,
        country: asnDirectory.country,
      })
      .from(prefixMapping)
      .leftJoin(asnDirectory, eq(prefixMapping.asn, asnDirectory.asn))
      .orderBy(desc(prefixMapping.createdAt));

    let filtered = rows;
    if (asn !== undefined) {
      filtered = filtered.filter((r) => r.prefix.asn === asn);
    }
    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.prefix.cidr.toLowerCase().includes(search) ||
          String(r.prefix.asn).includes(search) ||
          (r.orgName && r.orgName.toLowerCase().includes(search))
      );
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map((r) => ({
      ...r.prefix,
      asnName: r.orgName || `AS${r.prefix.asn}`,
      country: r.country || "UNKNOWN",
    }));

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/asn/prefixes error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

