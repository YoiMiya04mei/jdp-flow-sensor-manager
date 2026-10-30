import crypto from "crypto";
import type { ConfigTemplateContext } from "./types";

/**
 * Calculates a cryptographic SHA-256 fingerprint of the configuration snapshot.
 * Ensures immutability: any modification to parameters or generated commands
 * produces a different hash, rendering previous approvals invalid.
 */
export function computeConfigSnapshotHash(
  templateId: string,
  ctx: ConfigTemplateContext,
  generatedConfig: string,
  rollbackConfig: string
): string {
  const payload = {
    templateId,
    deviceName: ctx.deviceName,
    vendor: ctx.vendor,
    model: ctx.model || null,
    managementIp: ctx.managementIp,
    exporterIp: ctx.exporterIp,
    collectorIp: ctx.collectorIp,
    collectorPort: ctx.collectorPort,
    protocol: ctx.protocol,
    samplingRate: ctx.samplingRate,
    direction: ctx.direction,
    interfaces: (ctx.interfaces || []).map((i) => i.ifName).sort(),
    generatedConfig: generatedConfig.trim(),
    rollbackConfig: rollbackConfig.trim(),
  };

  const serialized = JSON.stringify(payload);
  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

