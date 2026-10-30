import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import type { SessionUser, UserRole } from "@/types";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  neteng: 3,
  operator: 2,
  analyst: 1,
};

/**
 * Check if a role is included in allowed roles.
 */
export function isRoleAllowed(
  userRole: UserRole,
  allowedRoles: UserRole[]
): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Check if user has write/mutation permissions.
 * Analyst is strictly READ-ONLY.
 */
export function canPerformMutation(userRole: UserRole): boolean {
  return userRole !== "analyst";
}

/**
 * Middleware/Guard for Route Handlers to enforce authentication and RBAC.
 */
export async function authenticateAndAuthorize(
  allowedRoles?: UserRole[]
): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Active session required" },
      { status: 401 }
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.json(
      {
        success: false,
        error: `Forbidden: Role '${user.role}' lacks permission for this action`,
      },
      { status: 403 }
    );
  }

  return { user };
}

