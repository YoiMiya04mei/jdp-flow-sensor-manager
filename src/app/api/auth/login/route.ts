import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth/crypto";
import {
  createSessionToken,
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/server/auth/session";
import { recordAuditLog } from "@/server/audit/audit-service";
import { loginSchema } from "@/lib/validations/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const rawUsername = parsed.data.username;
    const username = rawUsername.trim();
    const password = parsed.data.password;

    console.log(`[AUTH LOGIN] Attempt: username="${username}" (raw="${rawUsername}")`);

    // Look up user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    // Self-healing: if demo account requested in dev mode and missing from DB, auto-seed
    if (!user && process.env.NODE_ENV !== "production" && username.startsWith("demo_")) {
      try {
        console.log(`[AUTH LOGIN] Auto-seeding missing demo accounts for "${username}"...`);
        process.env.ENABLE_DEV_SEED = "true";
        const { seedDevelopmentData } = await import("@/server/db/seed");
        await seedDevelopmentData();
        const [reseeded] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        user = reseeded;
      } catch (seedErr) {
        console.error("[AUTH LOGIN] Auto-seed error:", seedErr);
      }
    }

    if (!user) {
      console.log(`[AUTH LOGIN] FAILED: User "${username}" not found in database.`);
      const allUsers = await db.select({ u: users.username }).from(users);
      console.log(`[AUTH LOGIN] Existing users in DB:`, allUsers.map(x => x.u));
      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Verify password hash
    const isValid = verifyPassword(password, user.passwordHash);
    console.log(`[AUTH LOGIN] Password check for "${username}": isValid=${isValid}`);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Create session token
    const sessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    const token = createSessionToken(sessionUser);

    // Record audit log
    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "login",
      targetEntity: "user",
      targetId: user.id,
      diffJson: { role: user.role },
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    // Set HTTP-Only Cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: sessionUser,
      },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_SECONDS,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("Login route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

