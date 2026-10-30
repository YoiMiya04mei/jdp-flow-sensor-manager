import type { VendorTemplate, ConfigTemplateContext, GeneratedConfigResult, TemplateValidationResult } from "../types";
import { sanitizeCliIdentifier, sanitizeIpAddress, sanitizePortNumber, sanitizeSamplingRate } from "../sanitizer";
import { computeConfigSnapshotHash } from "../snapshot-hasher";

export const huaweiTemplate: VendorTemplate = {
  id: "huawei_vrp_netstream",
  name: "Huawei VRP (NetStream v9 / IPFIX)",
  vendor: "huawei",
  family: "VRP",
  description: "Carrier NetStream configuration for Huawei NetEngine (NE40E, NE8000) and CloudEngine switches.",
  supportedModels: ["NE40E-X8", "NE40E-X3", "NE8000-M8", "NE8000-F1A", "S6720", "S6730", "CE6800", "AR6000"],
  supportedOsVersions: ["VRP (R) Software, Version 8.x", "VRP Version 5.x"],
  supportedProtocols: ["netflow_v9", "ipfix", "netflow_v5"],
  compatibilityStatus: "verified",
  isLiveExecutionSupported: true,
  prerequisites: [
    "VRP system-view administrative privileges",
    "Loopback0 or source interface routed to collector network",
    "NetStream license active on NetEngine chassis",
  ],

  validate(ctx: ConfigTemplateContext): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const devCheck = sanitizeCliIdentifier(ctx.deviceName, "Device Name");
    if (!devCheck.valid) errors.push(devCheck.error!);

    const mgmtCheck = sanitizeIpAddress(ctx.managementIp, "Management IP");
    if (!mgmtCheck.valid) errors.push(mgmtCheck.error!);

    const expCheck = sanitizeIpAddress(ctx.exporterIp, "Exporter Source IP");
    if (!expCheck.valid) errors.push(expCheck.error!);

    const colCheck = sanitizeIpAddress(ctx.collectorIp, "Collector IP");
    if (!colCheck.valid) errors.push(colCheck.error!);

    const portCheck = sanitizePortNumber(ctx.collectorPort, "Collector Port");
    if (!portCheck.valid) errors.push(portCheck.error!);

    const rateCheck = sanitizeSamplingRate(ctx.samplingRate, "Sampling Rate");
    if (!rateCheck.valid) errors.push(rateCheck.error!);

    if (!ctx.interfaces || ctx.interfaces.length === 0) {
      errors.push("Huawei VRP NetStream requires interface names (e.g. GigabitEthernet0/1/0, 100GE1/0/1) for binding.");
    } else {
      for (const iface of ctx.interfaces) {
        const ifCheck = sanitizeCliIdentifier(iface.ifName, "Interface Name");
        if (!ifCheck.valid) errors.push(ifCheck.error!);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  generate(ctx: ConfigTemplateContext): GeneratedConfigResult {
    const validation = this.validate(ctx);
    if (!validation.valid) {
      throw new Error(`Validation failed for Huawei template: ${validation.errors.join(", ")}`);
    }

    const versionNum = ctx.protocol === "netflow_v5" ? "5" : "9";

    const lines: string[] = [
      `# ==============================================================================`,
      `# JDP FLOW SENSOR - HUAWEI VRP NETSTREAM FLOW EXPORTER CONFIGURATION`,
      `# Generated for Device: ${ctx.deviceName} (${ctx.managementIp})`,
      `# Target Collector: ${ctx.collectorIp}:${ctx.collectorPort} | Protocol: ${ctx.protocol.toUpperCase()}`,
      `# Exporter Source IP: ${ctx.exporterIp} | Sampling Rate: 1:${ctx.samplingRate}`,
      `# ==============================================================================`,
      `system-view`,
      ``,
      `# 1. Global NetStream Flow Export Parameters`,
      `ip netstream export host ${ctx.collectorIp} ${ctx.collectorPort}`,
      `ip netstream export source ${ctx.exporterIp}`,
      `ip netstream export version ${versionNum}`,
      `ip netstream export version 9 origin-as`,
      `ip netstream timeout active 1`,
      `ip netstream timeout inactive 15`,
      ``,
      `# 2. Configure Packet Sampler`,
      `ip netstream sampler fix-packets ${ctx.samplingRate} inbound`,
      `ip netstream sampler fix-packets ${ctx.samplingRate} outbound`,
      ``,
      `# 3. Apply NetStream to Selected Interfaces`,
    ];

    for (const iface of ctx.interfaces) {
      lines.push(`interface ${iface.ifName}`);
      if (ctx.direction === "ingress" || ctx.direction === "both") {
        lines.push(` ip netstream inbound`);
        lines.push(` ip netstream sampler fix-packets ${ctx.samplingRate} inbound`);
      }
      if (ctx.direction === "egress" || ctx.direction === "both") {
        lines.push(` ip netstream outbound`);
        lines.push(` ip netstream sampler fix-packets ${ctx.samplingRate} outbound`);
      }
      lines.push(`quit`);
    }

    lines.push(``);
    lines.push(`return`);

    const configCmds = lines.join("\n");

    const verifLines: string[] = [
      `# ==============================================================================`,
      `# HUAWEI VRP OPERATIONAL VERIFICATION COMMANDS`,
      `# ==============================================================================`,
      `display ip netstream export`,
      `display ip netstream statistic`,
      `display current-configuration | include netstream`,
      `display interface ${ctx.interfaces?.[0]?.ifName || "GigabitEthernet0/1/0"} | include netstream`,
    ];
    const verifCmds = verifLines.join("\n");

    const rollbackLines: string[] = [
      `# ==============================================================================`,
      `# HUAWEI VRP ROLLBACK SCRIPT`,
      `# ==============================================================================`,
      `system-view`,
    ];
    for (const iface of ctx.interfaces) {
      rollbackLines.push(`interface ${iface.ifName}`);
      rollbackLines.push(` undo ip netstream inbound`);
      rollbackLines.push(` undo ip netstream outbound`);
      rollbackLines.push(`quit`);
    }
    rollbackLines.push(`undo ip netstream export host ${ctx.collectorIp} ${ctx.collectorPort}`);
    rollbackLines.push(`undo ip netstream export source`);
    rollbackLines.push(`return`);

    const rollbackCmds = rollbackLines.join("\n");
    const hash = computeConfigSnapshotHash(this.id, ctx, configCmds, rollbackCmds);

    return {
      templateId: this.id,
      templateName: this.name,
      vendor: this.vendor,
      compatibilityStatus: this.compatibilityStatus,
      isLiveExecutionSupported: this.isLiveExecutionSupported,
      configurationCommands: configCmds,
      verificationCommands: verifCmds,
      rollbackCommands: rollbackCmds,
      warnings: validation.warnings,
      prerequisites: this.prerequisites,
      summary: `Configures Huawei VRP NetStream v${versionNum} export to ${ctx.collectorIp}:${ctx.collectorPort} with sampling 1:${ctx.samplingRate}.`,
      snapshotHash: hash,
    };
  },
};

