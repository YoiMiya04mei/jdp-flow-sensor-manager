import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { canPerformMutation } from "@/server/auth/rbac";
import { provisioningService } from "@/server/provisioning/provisioning-service";

export async function GET(
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

    const { id } = await params;
    const job = await provisioningService.getJobById(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Configuration job not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch configuration." },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const job = await provisioningService.cancelJob(id, user, clientIp);

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to cancel configuration." },
      { status: 400 }
    );
  }
}

