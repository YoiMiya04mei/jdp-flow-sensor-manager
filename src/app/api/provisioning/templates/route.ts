import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { templateRegistry } from "@/server/provisioning/template-registry";

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
    const vendor = searchParams.get("vendor");

    let templates = templateRegistry.getAll();
    if (vendor && vendor !== "all") {
      templates = templates.filter((t) => t.vendor.toLowerCase() === vendor.toLowerCase());
    }

    return NextResponse.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        vendor: t.vendor,
        family: t.family,
        description: t.description,
        supportedModels: t.supportedModels,
        supportedOsVersions: t.supportedOsVersions,
        supportedProtocols: t.supportedProtocols,
        compatibilityStatus: t.compatibilityStatus,
        isLiveExecutionSupported: t.isLiveExecutionSupported,
        prerequisites: t.prerequisites,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch vendor templates." },
      { status: 500 }
    );
  }
}

