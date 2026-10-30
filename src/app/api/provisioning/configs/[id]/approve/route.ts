import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
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

    // Only NetEng or Admin can review/approve
    if (user.role !== "admin" && user.role !== "neteng") {
      return NextResponse.json(
        { success: false, error: `Forbidden: Role '${user.role}' lacks permission to approve or reject provisioning requests.` },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const action = body.action === "reject" ? "reject" : "approve";
    const notes = body.notes || undefined;

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const job = await provisioningService.approveOrReject(id, action, user, notes, clientIp);

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process approval decision." },
      { status: 400 }
    );
  }
}

