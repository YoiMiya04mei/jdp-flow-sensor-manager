import { flowCollectorService } from "./flow-collector-service";
import { runMigrations } from "../db/migrate";

async function main() {
  console.log("==========================================================");
  console.log("   JDP Flow Sensor Manager — UDP Collector Daemon (v1.0)  ");
  console.log("   NOC ISP Ingestion Engine: NetFlow v5/v9, IPFIX, sFlow  ");
  console.log("==========================================================");

  try {
    // 0. Ensure database migrations and pragmas are initialized
    console.log("[Collector] Verifying database schema and SQLite PRAGMAs...");
    await runMigrations();

    const bindStatuses = await flowCollectorService.start();
    console.log("\n[Collector] Port Bind Statuses:");
    for (const status of bindStatuses) {
      if (status.bound) {
        console.log(`  ✓ UDP Port ${status.port}: LISTENING (Ready)`);
      } else {
        console.error(`  ✗ UDP Port ${status.port}: FAILED (${status.error})`);
      }
    }

    const telemetry = flowCollectorService.getTelemetry();
    console.log(`\n[Collector] State: ${telemetry.state.toUpperCase()}`);
    console.log(`[Collector] Ingestion Host: ${telemetry.listenHost}`);
    console.log("[Collector] Press Ctrl+C to stop.\n");

    // Periodic telemetry log every 30 seconds
    const interval = setInterval(() => {
      const t = flowCollectorService.getTelemetry();
      console.log(
        `[Telemetry ${new Date().toLocaleTimeString()}] Pkts: ${t.packetsReceived} (Valid: ${t.packetsValid}, Malformed: ${t.packetsMalformed}) | Flows Parsed: ${t.flowsParsed} | Flows Matched: ${t.flowsMatched} | Unknown Exporters: ${t.unknownExporters}`
      );
    }, 30_000);

    const shutdown = async (signal: string) => {
      console.log(`\n[Collector] Received ${signal}. Shutting down gracefully...`);
      clearInterval(interval);
      await flowCollectorService.stop();
      console.log("[Collector] Sockets closed and metrics flushed. Exiting.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("[Collector] Fatal error starting collector daemon:", err);
    process.exit(1);
  }
}

if (require.main === module || process.argv[1]?.endsWith("collector-daemon.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

