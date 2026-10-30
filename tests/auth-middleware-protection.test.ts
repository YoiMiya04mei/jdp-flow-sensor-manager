import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { createSessionToken, COOKIE_NAME } from "@/server/auth/session";
import type { SessionUser } from "@/types";

describe("Authentication Middleware & Route Protection", () => {
  const testUser: SessionUser = {
    id: "usr-mid-1",
    username: "neteng_user",
    email: "neteng@noc.internal",
    role: "neteng",
  };

  const validToken = createSessionToken(testUser);

  it("should redirect unauthenticated request to /login when accessing root '/'", async () => {
    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("should redirect unauthenticated request to /login?redirect=/devices when accessing '/devices'", async () => {
    const req = new NextRequest("http://localhost:3000/devices");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login?redirect=%2Fdevices");
  });

  it("should redirect unauthenticated request to /login when accessing any protected feature", async () => {
    const protectedPaths = [
      "/sensors",
      "/traffic/explorer",
      "/traffic/top-asns",
      "/analytics/sankey",
      "/config-generator",
      "/audit-logs",
      "/settings",
    ];

    for (const path of protectedPaths) {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    }
  });

  it("should return 401 JSON for unauthenticated requests to protected API endpoints", async () => {
    const protectedApis = ["/api/devices", "/api/sensors", "/api/traffic/overview", "/api/audit-logs"];

    for (const apiPath of protectedApis) {
      const req = new NextRequest(`http://localhost:3000${apiPath}`);
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Unauthorized");
    }
  });

  it("should allow public API routes without authentication", async () => {
    // /api/health
    const reqHealth = new NextRequest("http://localhost:3000/api/health");
    const resHealth = await middleware(reqHealth);
    expect(resHealth.status).toBe(200);

    // /api/auth/login
    const reqLogin = new NextRequest("http://localhost:3000/api/auth/login");
    const resLogin = await middleware(reqLogin);
    expect(resLogin.status).toBe(200);
  });

  it("should allow unauthenticated visitor to view /login page", async () => {
    const req = new NextRequest("http://localhost:3000/login");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it("should redirect authenticated user away from /login to '/'", async () => {
    const req = new NextRequest("http://localhost:3000/login");
    req.cookies.set(COOKIE_NAME, validToken);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("should allow authenticated user to access protected pages", async () => {
    const req = new NextRequest("http://localhost:3000/devices");
    req.cookies.set(COOKIE_NAME, validToken);
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it("should reject tampered or corrupted session token and redirect to /login", async () => {
    const req = new NextRequest("http://localhost:3000/devices");
    req.cookies.set(COOKIE_NAME, "bogus.invalid.token");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});

