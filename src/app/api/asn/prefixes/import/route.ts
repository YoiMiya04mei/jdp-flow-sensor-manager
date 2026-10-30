import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { prefixMapping, asnDirectory } from "@/server/db/schema";
import { parseIpv4Cidr } from "@/server/asn/prefix-trie";
import { asnEnrichmentService } from "@/server/asn/asn-enrichment-service";
import { recordAuditLog } from "@/server/audit/audit-service";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    // Role verification: Only Admin and NetEng can import prefix mappings
    if (user.role !== "admin" && user.role !== "neteng") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin or NetEng role required to import prefix mappings" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const rawList = Array.isArray(body?.prefixes) ? body.prefixes : [];

    if (rawList.length === 0) {
      return NextResponse.json(
        { success: false, error: "Validation Error: 'prefixes' array is empty or missing" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    let duplicates = 0;
    const rejectedItems: Array<{ cidr: string; reason: string }> = [];

    // Preload known ASNs
    const existingAsns = await db.select().from(asnDirectory);
    const knownAsnSet = new Set(existingAsns.map((a) => a.asn));

    for (const item of rawList) {
      const cidrRaw = item.cidr?.trim();
      const asn = parseInt(item.asn, 10);

      if (!cidrRaw || isNaN(asn) || asn <= 0 || asn > 4294967295) {
        rejected++;
        rejectedItems.push({ cidr: cidrRaw || "null", reason: "Invalid ASN number or CIDR string" });
        continue;
      }

      // Validate CIDR format
      const parsed = parseIpv4Cidr(cidrRaw);
      if (!parsed) {
        rejected++;
        rejectedItems.push({ cidr: cidrRaw, reason: "Malformed IPv4 CIDR prefix" });
        continue;
      }

      const normalizedCidr = parsed.normalizedCidr;

      // Ensure ASN exists in asn_directory
      if (!knownAsnSet.has(asn)) {
        await db.insert(asnDirectory).values({
          asn,
          name: `AS${asn}`,
          country: "UNKNOWN",
          organizationType: "transit",
          updatedAt: now,
        });
        knownAsnSet.add(asn);
      }

      // Check if CIDR prefix already exists
      const [existingPfx] = await db
        .select()
        .from(prefixMapping)
        .where(eq(prefixMapping.cidr, normalizedCidr))
        .limit(1);

      if (existingPfx) {
        if (existingPfx.asn === asn) {
          duplicates++;
        } else {
          // Update ASN mapping
          await db
            .update(prefixMapping)
            .set({
              asn,
              source: item.source || "imported",
              updatedAt: now,
            })
            .where(eq(prefixMapping.id, existingPfx.id));
          updated++;
        }
      } else {
        await db.insert(prefixMapping).values({
          id: crypto.randomUUID(),
          cidr: normalizedCidr,
          family: "ipv4",
          asn,
          source: item.source || "imported",
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
      }
    }

    // Reload in-memory Trie
    await asnEnrichmentService.initialize();

    // Audit log
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "create",
      targetEntity: "prefix_mapping",
      targetId: "batch_import",
      diffJson: {
        totalReceived: rawList.length,
        inserted,
        updated,
        duplicates,
        rejected,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalProcessed: rawList.length,
        inserted,
        updated,
        duplicates,
        rejected,
        rejectedItems: rejectedItems.slice(0, 20),
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("POST /api/asn/prefixes/import error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

