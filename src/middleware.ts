import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "jdp_session";
const DEFAULT_DEMO_JWT_SECRET =
  "super-secret-jdp-noc-jwt-token-key-change-in-production";

/**
 * Edge-compatible Web Crypto HMAC-SHA256 session token verification.
 * Zero Node.js runtime dependencies (works natively in Next.js Edge Middleware).
 */
async function verifySessionTokenEdge(
  token: string,
  secret: string
): Promise<{ id: string; username: string; role: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signatureInput)
    );

    // Compute expected base64url signature
    const bytes = new Uint8Array(sigBuf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64First = btoa(binary);

    const expectedSig = btoa(base64First)
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (signature !== expectedSig) return null;

    let b64Payload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    while (b64Payload.length % 4) b64Payload += "=";
    const payload = JSON.parse(atob(b64Payload));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public static assets and internal Next.js routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Allow public API endpoints
  if (pathname === "/api/auth/login" || pathname === "/api/health") {
    return NextResponse.next();
  }

  // 3. Extract and verify session token
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.JWT_SECRET || DEFAULT_DEMO_JWT_SECRET;
  const user = token ? await verifySessionTokenEdge(token, secret) : null;

  // 4. Handle /login page
  if (pathname === "/login") {
    // If already authenticated, redirect to root dashboard
    if (user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 5. Handle Protected API routes (/api/*)
  if (pathname.startsWith("/api/")) {
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 6. Handle Protected Pages (/, /devices, /sensors, /traffic/*, etc.)
  if (!user) {
    // Redirect unauthenticated visitor to /login
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files with extensions (.svg, .png, .jpg, .css, .js, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ico)$).*)",
  ],
};
