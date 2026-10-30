/**
 * Next.js Server Startup Instrumentation Hook
 * Automatically runs database schema migrations and pragma verification on web server boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./server/db/migrate");
    await runMigrations();
  }
}

