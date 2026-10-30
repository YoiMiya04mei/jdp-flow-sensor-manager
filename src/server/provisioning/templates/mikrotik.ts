import type { VendorTemplate, ConfigTemplateContext, GeneratedConfigResult, TemplateValidationResult } from "../types";
import { sanitizeCliIdentifier, sanitizeIpAddress, sanitizePortNumber, sanitizeSamplingRate } from "../sanitizer";
import { computeConfigSnapshotHash } from "../snapshot-hasher";

export const mikrotikTemplate: VendorTemplate = {
  id: "mikrotik_routeros_v7",
  name: "MikroTik RouterOS (v7 / v6 Traffic Flow)",
  vendor: "mikrotik",
  family: "RouterOS",
  description: "Native RouterOS /ip traffic-flow configuration supporting IPFIX and NetFlow v9/v5 export targets.",
  supportedModels: ["CCR2004", "CCR2116", "CCR1036", "CCR1072", "RB4011", "RB5009", "Cloud Hosted Router (CHR)"],
  supportedOsVersions: ["RouterOS v7.x (Recommended)", "RouterOS v6.48+"],
  supportedProtocols: ["ipfix", "netflow_v9", "netflow_v5"],
  compatibilityStatus: "verified",
  isLiveExecutionSupported: true,
  prerequisites: [
    "RouterOS admin access via CLI / WinBox / SSH",
    "IP route to collector destination IP is reachable",
    "UDP traffic flow port is allowed on router firewall output filter",
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
      warnings.push("No specific interfaces selected. /ip traffic-flow will apply to 'all' interfaces by default.");
    } else {
      for (const iface of ctx.interfaces) {
        const ifCheck = sanitizeCliIdentifier(iface.ifName, "Interface Name");
        if (!ifCheck.valid) errors.push(ifCheck.error!);
      }
    }

    if (ctx.protocol === "sflow_v5") {
      errors.push("MikroTik RouterOS /ip traffic-flow does not support sFlow v5. Please select IPFIX, NetFlow v9, or NetFlow v5.");
    }

    if (ctx.samplingRate > 10000) {
      warnings.push(`Sampling rate of 1:${ctx.samplingRate} is unusually high. Typical ISP sampling rates range between 1:100 to 1:2000.`);
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  generate(ctx: ConfigTemplateContext): GeneratedConfigResult {
    const validation = this.validate(ctx);
    if (!validation.valid) {
      throw new Error(`Validation failed for MikroTik template: ${validation.errors.join(", ")}`);
    }

    // Map protocol to RouterOS version string
    let rosVersionStr = "ipfix";
    if (ctx.protocol === "netflow_v9") rosVersionStr = "9";
    if (ctx.protocol === "netflow_v5") rosVersionStr = "5";

    const ifacesList =
      ctx.interfaces && ctx.interfaces.length > 0
        ? ctx.interfaces.map((i) => i.ifName).join(",")
        : "all";

    const lines: string[] = [
      `# ==============================================================================`,
      `# JDP FLOW SENSOR - MIKROTIK ROUTEROS FLOW EXPORTER CONFIGURATION`,
      `# Generated for Device: ${ctx.deviceName} (${ctx.managementIp})`,
      `# Target Collector: ${ctx.collectorIp}:${ctx.collectorPort} | Protocol: ${ctx.protocol.toUpperCase()}`,
      `# Exporter Source IP: ${ctx.exporterIp}`,
      `# ==============================================================================`,
      ``,
      `# 1. Enable Global Traffic Flow Engine`,
      `/ip traffic-flow set enabled=yes interfaces=${ifacesList} cache-entries=128k active-flow-timeout=1m inactive-flow-timeout=15s`,
      ``,
      `# 2. Remove existing JDP collector target if present (Idempotent update)`,
      `:do { /ip traffic-flow target remove [find name="jdp-collector"] } on-error={}`,
      `:do { /ip traffic-flow target remove [find dst-address=${ctx.collectorIp} port=${ctx.collectorPort}] } on-error={}`,
      ``,
      `# 3. Add JDP Collector Export Target`,
      `/ip traffic-flow target add name="jdp-collector" dst-address=${ctx.collectorIp} port=${ctx.collectorPort} version=${rosVersionStr} src-address=${ctx.exporterIp}`,
      ``,
      `# 4. Optional: Configure hardware IP packet sampling (if supported on CCR2xxx)`,
      `# Note: RouterOS v7 handles flow sampling in software; ensure CPU utilization is monitored.`,
      `:put "JDP Flow Sensor configuration successfully applied."`,
    ];

    const configCmds = lines.join("\n");

    const verifLines: string[] = [
      `# ==============================================================================`,
      `# MIKROTIK ROUTEROS OPERATIONAL VERIFICATION COMMANDS`,
      `# Run these commands in RouterOS Terminal to verify flow export status:`,
      `# ==============================================================================`,
      `/ip traffic-flow print`,
      `/ip traffic-flow target print detail`,
      `/ip traffic-flow status print`,
      `/tool torch interface=${ctx.interfaces?.[0]?.ifName || "ether1"} port=${ctx.collectorPort} duration=5s`,
    ];
    const verifCmds = verifLines.join("\n");

    const rollbackLines: string[] = [
      `# ==============================================================================`,
      `# MIKROTIK ROUTEROS ROLLBACK SCRIPT (Reversal of JDP Flow Configuration)`,
      `# ==============================================================================`,
      `:do { /ip traffic-flow target remove [find name="jdp-collector"] } on-error={}`,
      `:do { /ip traffic-flow target remove [find dst-address=${ctx.collectorIp} port=${ctx.collectorPort}] } on-error={}`,
      `# If no other monitoring tools use traffic-flow, disable it:`,
      `/ip traffic-flow set enabled=no`,
      `:put "JDP Flow Sensor configuration rolled back."`,
    ];
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
      summary: `Configures MikroTik RouterOS /ip traffic-flow targeting ${ctx.collectorIp}:${ctx.collectorPort} (${rosVersionStr}) with source ${ctx.exporterIp}.`,
      snapshotHash: hash,
    };
  },
};

