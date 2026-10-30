import { db } from "../db";
import { auditLogs } from "../db/schema";
import crypto from "crypto";

export interface LogAuditParams {
  userId?: string | null;
  username: string;
  action: string;
  targetEntity: string;
  targetId?: string | null;
  diffJson?: Record<string, any> | string | null;
  ipAddress?: string | null;
}

/**
 * Record an immutable audit log entry.
 */
export async function recordAuditLog(params: LogAuditParams): Promise<void> {
  try {
    const diffString =
      params.diffJson && typeof params.diffJson === "object"
        ? JSON.stringify(params.diffJson)
        : (params.diffJson as string | undefined) || null;

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: params.userId || null,
      username: params.username,
      action: params.action,
      targetEntity: params.targetEntity,
      targetId: params.targetId || null,
      diffJson: diffString,
      ipAddress: params.ipAddress || "127.0.0.1",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Audit log failure should be captured without crashing the main transaction
    console.error("Failed to write audit log:", err);
  }
}

