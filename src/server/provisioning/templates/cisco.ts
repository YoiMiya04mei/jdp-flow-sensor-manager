import type { VendorTemplate, ConfigTemplateContext, GeneratedConfigResult, TemplateValidationResult } from "../types";
import { sanitizeCliIdentifier, sanitizeIpAddress, sanitizePortNumber, sanitizeSamplingRate } from "../sanitizer";
import { computeConfigSnapshotHash } from "../snapshot-hasher";

export const ciscoTemplate: VendorTemplate = {
  id: "cisco_iosxe_fnf",
  name: "Cisco IOS-XE (Flexible NetFlow - FNF)",
  vendor: "cisco",
  family: "IOS-XE",
  description: "Enterprise and edge Flexible NetFlow (FNF) template for Cisco ASR1000, Catalyst 9000, and ISR4000 series.",
  supportedModels: ["ASR1001-X", "ASR1002-HX", "Catalyst 9300", "Catalyst 9500", "ISR4331", "ISR4451", "CSR1000v"],
  supportedOsVersions: ["Cisco IOS-XE 16.x", "Cisco IOS-XE 17.x (Recommended)"],
  supportedProtocols: ["netflow_v9", "ipfix"],
  compatibilityStatus: "verified",
  isLiveExecutionSupported: true,
  prerequisites: [
    "Privileged EXEC mode (enable) access",
    "Source interface (Loopback0 or GigabitEthernet) configured with IP",
    "Adequate DRAM for flow cache entries",
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
      errors.push("Cisco IOS-XE FNF requires at least one target interface (e.g. GigabitEthernet0/0/1, TenGigabitEthernet0/1/0).");
    } else {
      for (const iface of ctx.interfaces) {
        const ifCheck = sanitizeCliIdentifier(iface.ifName, "Interface Name");
        if (!ifCheck.valid) errors.push(ifCheck.error!);
      }
    }

    if (ctx.protocol === "netflow_v5") {
      warnings.push("Traditional NetFlow v5 is legacy on IOS-XE. Flexible NetFlow v9 or IPFIX is recommended.");
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  generate(ctx: ConfigTemplateContext): GeneratedConfigResult {
    const validation = this.validate(ctx);
    if (!validation.valid) {
      throw new Error(`Validation failed for Cisco template: ${validation.errors.join(", ")}`);
    }

    const exportProtocol = ctx.protocol === "ipfix" ? "ipfix" : "netflow-v9";

    const lines: string[] = [
      `! ==============================================================================`,
      `! JDP FLOW SENSOR - CISCO IOS-XE FLEXIBLE NETFLOW (FNF) CONFIGURATION`,
      `! Generated for Device: ${ctx.deviceName} (${ctx.managementIp})`,
      `! Target Collector: ${ctx.collectorIp}:${ctx.collectorPort} | Protocol: ${ctx.protocol.toUpperCase()}`,
      `! Exporter Source IP: ${ctx.exporterIp} | Sampling Rate: 1:${ctx.samplingRate}`,
      `! ==============================================================================`,
      `configure terminal`,
      ``,
      `! 1. Define Flow Exporter`,
      `flow exporter JDP-EXPORTER`,
      ` destination ${ctx.collectorIp}`,
      ` source ${ctx.exporterIp}`,
      ` transport udp ${ctx.collectorPort}`,
      ` export-protocol ${exportProtocol}`,
      ` template data timeout 60`,
      `!`,
      `! 2. Define Flow Record`,
      `flow record JDP-RECORD`,
      ` match ipv4 tos`,
      ` match ipv4 protocol`,
      ` match ipv4 source address`,
      ` match ipv4 destination address`,
      ` match transport source-port`,
      ` match transport destination-port`,
      ` collect transport tcp flags`,
      ` collect counter bytes long`,
      ` collect counter packets long`,
      ` collect timestamp sys-uptime first`,
      ` collect timestamp sys-uptime last`,
      ` collect routing source as`,
      ` collect routing destination as`,
      `!`,
      `! 3. Define Flow Monitor`,
      `flow monitor JDP-MONITOR`,
      ` exporter JDP-EXPORTER`,
      ` record JDP-RECORD`,
      ` cache timeout active 60`,
      ` cache timeout inactive 15`,
      `!`,
      `! 4. Define Sampler`,
      `sampler JDP-SAMPLER`,
      ` mode random 1 out-of ${ctx.samplingRate}`,
      `!`,
      `! 5. Apply Flow Monitor to Target Interfaces`,
    ];

    for (const iface of ctx.interfaces) {
      lines.push(`interface ${iface.ifName}`);
      if (ctx.direction === "ingress" || ctx.direction === "both") {
        lines.push(` ip flow monitor JDP-MONITOR sampler JDP-SAMPLER input`);
      }
      if (ctx.direction === "egress" || ctx.direction === "both") {
        lines.push(` ip flow monitor JDP-MONITOR sampler JDP-SAMPLER output`);
      }
      lines.push(`exit`);
    }

    lines.push(`end`);
    lines.push(`write memory`);

    const configCmds = lines.join("\n");

    const verifLines: string[] = [
      `! ==============================================================================`,
      `! CISCO IOS-XE OPERATIONAL VERIFICATION COMMANDS`,
      `! ==============================================================================`,
      `show flow exporter JDP-EXPORTER status`,
      `show flow exporter JDP-EXPORTER statistics`,
      `show flow monitor JDP-MONITOR cache`,
      `show flow monitor JDP-MONITOR statistics`,
      `show sampler JDP-SAMPLER`,
    ];
    const verifCmds = verifLines.join("\n");

    const rollbackLines: string[] = [
      `! ==============================================================================`,
      `! CISCO IOS-XE ROLLBACK SCRIPT`,
      `! ==============================================================================`,
      `configure terminal`,
    ];
    for (const iface of ctx.interfaces) {
      rollbackLines.push(`interface ${iface.ifName}`);
      rollbackLines.push(` no ip flow monitor JDP-MONITOR sampler JDP-SAMPLER input`);
      rollbackLines.push(` no ip flow monitor JDP-MONITOR sampler JDP-SAMPLER output`);
      rollbackLines.push(`exit`);
    }
    rollbackLines.push(`no flow monitor JDP-MONITOR`);
    rollbackLines.push(`no flow exporter JDP-EXPORTER`);
    rollbackLines.push(`no flow record JDP-RECORD`);
    rollbackLines.push(`no sampler JDP-SAMPLER`);
    rollbackLines.push(`end`);
    rollbackLines.push(`write memory`);

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
      summary: `Configures Cisco IOS-XE Flexible NetFlow (FNF) export (${exportProtocol}) to ${ctx.collectorIp}:${ctx.collectorPort} with sampling 1:${ctx.samplingRate}.`,
      snapshotHash: hash,
    };
  },
};

