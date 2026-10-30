import type { VendorTemplate, ConfigTemplateContext, GeneratedConfigResult, TemplateValidationResult } from "../types";
import { sanitizeCliIdentifier, sanitizeIpAddress, sanitizePortNumber, sanitizeSamplingRate } from "../sanitizer";
import { computeConfigSnapshotHash } from "../snapshot-hasher";

export const juniperTemplate: VendorTemplate = {
  id: "juniper_junos_inline_jflow",
  name: "Juniper Junos (Inline-Jflow / Sampling v9 & IPFIX)",
  vendor: "juniper",
  family: "Junos OS",
  description: "Carrier-grade Junos inline-jflow or cflowd sampling configuration for MX, PTX, SRX, and QFX switches.",
  supportedModels: ["MX204", "MX480", "MX960", "MX10003", "SRX300", "SRX1500", "QFX5100", "QFX5200", "vMX"],
  supportedOsVersions: ["Junos OS 19.x", "Junos OS 20.x", "Junos OS 21.x", "Junos OS 22.x", "Junos OS 23.x"],
  supportedProtocols: ["netflow_v9", "ipfix"],
  compatibilityStatus: "verified",
  isLiveExecutionSupported: true,
  prerequisites: [
    "Junos CLI configure mode access",
    "FPC Trio chipset or inline-jflow license installed on MX routers",
    "Loopback interface lo0.0 configured with router router-id/source IP",
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
      errors.push("Juniper Junos requires at least one target interface (e.g. ge-0/0/0, xe-0/0/1, et-0/0/0) for sampling attachment.");
    } else {
      for (const iface of ctx.interfaces) {
        const ifCheck = sanitizeCliIdentifier(iface.ifName, "Interface Name");
        if (!ifCheck.valid) errors.push(ifCheck.error!);
      }
    }

    if (ctx.protocol === "sflow_v5") {
      warnings.push("Junos uses separate 'protocols sflow' configuration instead of inline-jflow for sFlow. Generating sFlow template.");
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  generate(ctx: ConfigTemplateContext): GeneratedConfigResult {
    const validation = this.validate(ctx);
    if (!validation.valid) {
      throw new Error(`Validation failed for Juniper template: ${validation.errors.join(", ")}`);
    }

    const templateName = "jdp-flow-v9";
    const instanceName = "jdp-sampling-instance";

    const lines: string[] = [
      `# ==============================================================================`,
      `# JDP FLOW SENSOR - JUNIPER JUNOS FLOW EXPORTER CONFIGURATION`,
      `# Generated for Device: ${ctx.deviceName} (${ctx.managementIp})`,
      `# Target Collector: ${ctx.collectorIp}:${ctx.collectorPort} | Protocol: ${ctx.protocol.toUpperCase()}`,
      `# Exporter Source IP: ${ctx.exporterIp} | Sampling Rate: 1:${ctx.samplingRate}`,
      `# ==============================================================================`,
      ``,
      `# 1. Define Flow Record Template`,
      `set services flow-monitoring version9 template ${templateName} ipv4-template`,
      `set services flow-monitoring version9 template ${templateName} flow-active-timeout 60`,
      `set services flow-monitoring version9 template ${templateName} flow-inactive-timeout 15`,
      `set services flow-monitoring version9 template ${templateName} template-refresh-rate packets 1000`,
      `set services flow-monitoring version9 template ${templateName} template-refresh-rate seconds 60`,
      ``,
      `# 2. Define Sampling Instance & Flow Collector Destination`,
      `set forwarding-options sampling instance ${instanceName} input rate ${ctx.samplingRate}`,
      `set forwarding-options sampling instance ${instanceName} family inet output flow-server ${ctx.collectorIp} port ${ctx.collectorPort}`,
      `set forwarding-options sampling instance ${instanceName} family inet output flow-server ${ctx.collectorIp} version9 template ${templateName}`,
      `set forwarding-options sampling instance ${instanceName} family inet output flow-server ${ctx.collectorIp} source-address ${ctx.exporterIp}`,
      `set forwarding-options sampling instance ${instanceName} family inet output flow-server ${ctx.collectorIp} autonomous-system-type origin`,
      ``,
      `# 3. Associate Sampling Instance with Interfaces`,
    ];

    for (const iface of ctx.interfaces) {
      if (ctx.direction === "ingress" || ctx.direction === "both") {
        lines.push(`set interfaces ${iface.ifName} unit 0 family inet sampling input`);
      }
      if (ctx.direction === "egress" || ctx.direction === "both") {
        lines.push(`set interfaces ${iface.ifName} unit 0 family inet sampling output`);
      }
    }

    lines.push(``);
    lines.push(`# 4. Commit Check and Confirmation`);
    lines.push(`commit check`);
    lines.push(`commit comment "Configure JDP Flow Sensor Exporter on ${ctx.collectorIp}:${ctx.collectorPort}"`);

    const configCmds = lines.join("\n");

    const verifLines: string[] = [
      `# ==============================================================================`,
      `# JUNIPER JUNOS OPERATIONAL VERIFICATION COMMANDS`,
      `# ==============================================================================`,
      `show services accounting flow inline-jflow`,
      `show services accounting status inline-jflow`,
      `show services accounting errors inline-jflow`,
      `show interfaces terse | match "${ctx.interfaces?.[0]?.ifName || "ge-"}"`,
      `show forwarding-options sampling`,
    ];
    const verifCmds = verifLines.join("\n");

    const rollbackLines: string[] = [
      `# ==============================================================================`,
      `# JUNIPER JUNOS ROLLBACK SCRIPT`,
      `# ==============================================================================`,
    ];
    for (const iface of ctx.interfaces) {
      rollbackLines.push(`delete interfaces ${iface.ifName} unit 0 family inet sampling`);
    }
    rollbackLines.push(`delete forwarding-options sampling instance ${instanceName}`);
    rollbackLines.push(`delete services flow-monitoring version9 template ${templateName}`);
    rollbackLines.push(`commit comment "Rollback JDP Flow Sensor configuration"`);

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
      summary: `Configures Junos inline-jflow sampling (1:${ctx.samplingRate}) sending to ${ctx.collectorIp}:${ctx.collectorPort} via source ${ctx.exporterIp}.`,
      snapshotHash: hash,
    };
  },
};

