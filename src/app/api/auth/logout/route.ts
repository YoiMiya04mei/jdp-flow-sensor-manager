import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, COOKIE_NAME } from "@/server/auth/session";
import { recordAuditLog } from "@/server/audit/audit-service";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (user) {
      await recordAuditLog({
        userId: user.id,
        username: user.username,
        action: "logout",
        targetEntity: "user",
        targetId: user.id,
        ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("Logout error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

