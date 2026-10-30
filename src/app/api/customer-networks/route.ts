import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { customerNetworks } from "@/server/db/schema";
import { parseIpv4Cidr } from "@/server/asn/prefix-trie";
import { asnEnrichmentService } from "@/server/asn/asn-enrichment-service";
import { recordAuditLog } from "@/server/audit/audit-service";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

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

    let items = await db.select().from(customerNetworks).orderBy(desc(customerNetworks.createdAt));

    if (search) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(search) ||
          i.cidr.toLowerCase().includes(search) ||
          (i.description && i.description.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("GET /api/customer-networks error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    if (user.role !== "admin" && user.role !== "neteng") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin or NetEng role required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = body?.name?.trim();
    const cidrRaw = body?.cidr?.trim();
    const networkType = body?.networkType || "customer";
    const asn = body?.asn ? parseInt(body.asn, 10) : null;
    const description = body?.description?.trim() || null;

    if (!name || !cidrRaw) {
      return NextResponse.json(
        { success: false, error: "Validation Error: 'name' and 'cidr' are required" },
        { status: 400 }
      );
    }

    const parsed = parseIpv4Cidr(cidrRaw);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: "Validation Error: Malformed IPv4 CIDR prefix" },
        { status: 400 }
      );
    }

    const normalizedCidr = parsed.normalizedCidr;

    // Check duplicate
    const [existing] = await db
      .select()
      .from(customerNetworks)
      .where(eq(customerNetworks.cidr, normalizedCidr))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Conflict: Customer network CIDR '${normalizedCidr}' already registered` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const newRecord = {
      id,
      name,
      cidr: normalizedCidr,
      family: "ipv4" as const,
      networkType: networkType as any,
      asn,
      description,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(customerNetworks).values(newRecord);

    // Refresh trie
    await asnEnrichmentService.initialize();

    // Audit log
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "create",
      targetEntity: "customer_network",
      targetId: id,
      diffJson: { name, cidr: normalizedCidr, networkType },
    });

    return NextResponse.json(
      { success: true, data: newRecord },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("POST /api/customer-networks error:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

