import type { VendorTemplate, ConfigTemplateContext, GeneratedConfigResult, TemplateValidationResult } from "../types";
import { computeConfigSnapshotHash } from "../snapshot-hasher";

export const unsupportedVendorTemplate: VendorTemplate = {
  id: "unsupported_generic_vendor",
  name: "Unsupported / Unverified Vendor Template",
  vendor: "other",
  family: "Generic",
  description: "Placeholder for platforms without verified native golden templates (e.g. Nokia SR OS, ZTE). Live execution is strictly prohibited.",
  supportedModels: [],
  supportedOsVersions: [],
  supportedProtocols: ["netflow_v9", "ipfix", "sflow_v5"],
  compatibilityStatus: "unsupported",
  isLiveExecutionSupported: false,
  prerequisites: [
    "Consult vendor official configuration manual before applying any commands manually.",
  ],

  validate(ctx: ConfigTemplateContext): TemplateValidationResult {
    return {
      valid: false,
      errors: [
        `Vendor '${ctx.vendor}' has no verified CLI template in this version. Automatic live execution is prohibited to protect production routers.`,
      ],
      warnings: [
        "Please use manual configuration from your network hardware documentation.",
      ],
    };
  },

  generate(ctx: ConfigTemplateContext): GeneratedConfigResult {
    const configCmds = [
      `# ==============================================================================`,
      `# WARNING: UNVERIFIED / UNSUPPORTED VENDOR TEMPLATE (${ctx.vendor.toUpperCase()})`,
      `# No verified CLI template exists for this hardware in JDP Flow Sensor Manager.`,
      `# Live automatic execution is DISABLED for safety.`,
      `#`,
      `# Parameter Reference for Manual Provisioning:`,
      `#   - Target Device: ${ctx.deviceName} (${ctx.managementIp})`,
      `#   - Exporter Source IP: ${ctx.exporterIp}`,
      `#   - Collector Destination: ${ctx.collectorIp}:${ctx.collectorPort}`,
      `#   - Protocol: ${ctx.protocol}`,
      `#   - Packet Sampling Rate: 1:${ctx.samplingRate}`,
      `#   - Target Interfaces: ${(ctx.interfaces || []).map((i) => i.ifName).join(", ") || "All"}`,
      `# ==============================================================================`,
    ].join("\n");

    const verifCmds = `# Refer to ${ctx.vendor} CLI manual for show/display commands.`;
    const rollbackCmds = `# Refer to ${ctx.vendor} CLI manual for unconfigure commands.`;
    const hash = computeConfigSnapshotHash(this.id, ctx, configCmds, rollbackCmds);

    return {
      templateId: this.id,
      templateName: this.name,
      vendor: ctx.vendor,
      compatibilityStatus: "unsupported",
      isLiveExecutionSupported: false,
      configurationCommands: configCmds,
      verificationCommands: verifCmds,
      rollbackCommands: rollbackCmds,
      warnings: [
        `Live execution is locked: Vendor '${ctx.vendor}' syntax has not been verified in production test labs.`,
      ],
      prerequisites: this.prerequisites,
      summary: `Manual parameter reference for unverified vendor ${ctx.vendor}.`,
      snapshotHash: hash,
    };
  },
};

