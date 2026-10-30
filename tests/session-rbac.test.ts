import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
} from "@/server/auth/session";
import {
  isRoleAllowed,
  canPerformMutation,
  ROLE_HIERARCHY,
} from "@/server/auth/rbac";
import type { SessionUser, UserRole } from "@/types";

describe("Session Management & RBAC Permissions", () => {
  const adminUser: SessionUser = {
    id: "usr-admin-1",
    username: "test_admin",
    email: "admin@noc.local",
    role: "admin",
  };

  const analystUser: SessionUser = {
    id: "usr-analyst-1",
    username: "test_analyst",
    email: "analyst@noc.local",
    role: "analyst",
  };

  it("should create valid signed session token and verify it correctly", () => {
    const token = createSessionToken(adminUser);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const decoded = verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(adminUser.id);
    expect(decoded?.username).toBe(adminUser.username);
    expect(decoded?.role).toBe("admin");
  });

  it("should reject tampered session token signature", () => {
    const token = createSessionToken(adminUser);
    const parts = token.split(".");
    // Tamper with payload
    const tamperedToken = `${parts[0]}.eyJyYW5kb20iOiJib2d1cyJ9.${parts[2]}`;

    const decoded = verifySessionToken(tamperedToken);
    expect(decoded).toBeNull();
  });

  it("should enforce role hierarchy and check role allowances", () => {
    const allowedForConfig: UserRole[] = ["admin", "neteng"];

    expect(isRoleAllowed("admin", allowedForConfig)).toBe(true);
    expect(isRoleAllowed("neteng", allowedForConfig)).toBe(true);
    expect(isRoleAllowed("operator", allowedForConfig)).toBe(false);
    expect(isRoleAllowed("analyst", allowedForConfig)).toBe(false);
  });

  it("should enforce that Analyst is strictly read-only and cannot mutate", () => {
    expect(canPerformMutation("admin")).toBe(true);
    expect(canPerformMutation("neteng")).toBe(true);
    expect(canPerformMutation("operator")).toBe(true);
    // Analyst CANNOT mutate!
    expect(canPerformMutation("analyst")).toBe(false);
  });

  it("should correctly sort role hierarchy", () => {
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.neteng);
    expect(ROLE_HIERARCHY.neteng).toBeGreaterThan(ROLE_HIERARCHY.operator);
    expect(ROLE_HIERARCHY.operator).toBeGreaterThan(ROLE_HIERARCHY.analyst);
  });
});

