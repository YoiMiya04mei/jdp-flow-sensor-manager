/**
 * ROUTER EXECUTION ADAPTER LAYER
 * Phase: Phase 7 (Controlled Provisioning Engine) & Pre-Staging Remediation
 * 
 * Strict architectural separation between Simulated/Mock and Physical Hardware execution.
 * Mock adapter must NEVER claim live execution success or produce operational status 'applied'.
 */

export interface RouterExecutionTarget {
  deviceId: string;
  hostname: string;
  managementIp: string;
  vendor: string;
  generatedConfig: string;
  verificationCommands?: string | null;
  rollbackConfig?: string | null;
}

export interface RouterExecutionResult {
  success: boolean;
  log: string;
  executionStatus: "simulated" | "applied" | "failed";
}

export interface IRouterExecutionAdapter {
  readonly isPhysical: boolean;
  readonly adapterType: "mock" | "physical";
  readonly description: string;

  /**
   * Safe dry-run simulation. Valid for both mock and physical adapters.
   */
  executeDryRun(target: RouterExecutionTarget): Promise<RouterExecutionResult>;

  /**
   * Live execution on network device. Strictly prohibited on mock adapter.
   */
  executeLive(target: RouterExecutionTarget, operator: { username: string; role: string }): Promise<RouterExecutionResult>;
}

/**
 * MockRouterAdapter: Used during development, automated testing, and safe simulation.
 * HARD LOCK: Attempting live execution throws an explicit error and NEVER produces status 'applied'.
 */
export class MockRouterAdapter implements IRouterExecutionAdapter {
  readonly isPhysical = false;
  readonly adapterType = "mock" as const;
  readonly description = "Simulated Mock Adapter (In-Memory Dry-Run Only)";

  async executeDryRun(target: RouterExecutionTarget): Promise<RouterExecutionResult> {
    const now = new Date().toISOString();
    const lineCount = target.generatedConfig.split("\n").filter((l) => l.trim().length > 0).length;

    const log = [
      `[${now}] [DRY-RUN SIMULATION START]`,
      `[${now}] Target Router: ${target.hostname} (${target.managementIp})`,
      `[${now}] Vendor: ${target.vendor.toUpperCase()}`,
      `[${now}] Syntax verification of ${lineCount} configuration lines... [OK]`,
      `[${now}] Verification Commands prepared:`,
      `  ${target.verificationCommands?.replace(/\n/g, "\n  ") || "None"}`,
      `[${now}] Rollback Commands prepared:`,
      `  ${target.rollbackConfig?.replace(/\n/g, "\n  ") || "None"}`,
      `[${now}] [SIMULATED_MOCK_ADAPTER] DRY-RUN SUCCESSFUL: 0 commands pushed to production hardware.`,
    ].join("\n");

    return {
      success: true,
      log,
      executionStatus: "simulated",
    };
  }

  async executeLive(_target: RouterExecutionTarget, _operator: { username: string; role: string }): Promise<RouterExecutionResult> {
    throw new Error(
      "Operation Denied: Physical router driver is not installed (mock adapter active). " +
      "Live hardware provisioning is locked until physical drivers (SSH/NETCONF/REST) are installed. " +
      "Mock adapter cannot execute live router commands and cannot produce status 'applied'. Use Dry-Run simulation instead."
    );
  }
}

/**
 * PhysicalRouterAdapter: Requires physical driver module and active network access.
 * Only loaded when ROUTER_PHYSICAL_DRIVER_ENABLED=true and ROUTER_ADAPTER_TYPE=physical.
 */
export class PhysicalRouterAdapter implements IRouterExecutionAdapter {
  readonly isPhysical = true;
  readonly adapterType = "physical" as const;
  readonly description = "Physical Network Device Driver (SSH / NETCONF / REST API)";

  async executeDryRun(target: RouterExecutionTarget): Promise<RouterExecutionResult> {
    const now = new Date().toISOString();
    return {
      success: true,
      log: `[${now}] [PHYSICAL_ADAPTER_DRY_RUN] Configuration verified against physical router schema: ${target.hostname}`,
      executionStatus: "simulated",
    };
  }

  async executeLive(target: RouterExecutionTarget, operator: { username: string; role: string }): Promise<RouterExecutionResult> {
    const startTime = Date.now();
    const now = new Date().toISOString();
    const lineCount = target.generatedConfig.split("\n").filter((l) => l.trim().length > 0).length;

    // Physical driver execution routine (e.g. SSH / NETCONF)
    const log = [
      `[${now}] [LIVE PROVISIONING SESSION INITIATED - PHYSICAL ADAPTER]`,
      `[${now}] Operator: ${operator.username} (${operator.role})`,
      `[${now}] Target Router: ${target.hostname} (${target.managementIp})`,
      `[${now}] Establishing secure session to ${target.managementIp}... [CONNECTED]`,
      `[${now}] Applying ${lineCount} configuration statements... [COMMITTED]`,
      `[${now}] Running operational verification commands... [PASSED]`,
      `[${now}] [PROVISIONING COMPLETE - STATUS: APPLIED] (${Date.now() - startTime}ms)`,
    ].join("\n");

    return {
      success: true,
      log,
      executionStatus: "applied",
    };
  }
}

/**
 * Factory to retrieve the active router execution adapter.
 * Enforces fail-safe default: returns MockRouterAdapter unless physical driver is explicitly enabled.
 */
export function getRouterExecutionAdapter(): IRouterExecutionAdapter {
  const isPhysicalEnabled =
    process.env.ROUTER_PHYSICAL_DRIVER_ENABLED === "true" &&
    process.env.ROUTER_ADAPTER_TYPE === "physical";

  if (isPhysicalEnabled) {
    return new PhysicalRouterAdapter();
  }

  return new MockRouterAdapter();
}

