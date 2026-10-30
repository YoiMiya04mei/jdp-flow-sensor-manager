import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { canPerformMutation } from "@/server/auth/rbac";
import { provisioningService } from "@/server/provisioning/provisioning-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    if (!canPerformMutation(user.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Analyst role is strictly read-only." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const result = await provisioningService.executeDryRun(id, user, clientIp);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute dry-run simulation." },
      { status: 400 }
    );
  }
}

