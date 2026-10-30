import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import fs from "fs";
import path from "path";

const dbUrl = process.env.DATABASE_URL || "file:./data/jdp_noc.db";

// Ensure data directory exists if using local file path
if (dbUrl.startsWith("file:")) {
  const filePath = dbUrl.replace(/^file:/, "");
  const dir = path.dirname(path.resolve(process.cwd(), filePath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const sqliteClient = createClient({
  url: dbUrl,
});

/**
 * Configures and verifies essential SQLite database PRAGMAs:
 * - WAL mode (Write-Ahead Logging) for non-blocking concurrent reads/writes
 * - busy_timeout = 5000ms for lock contention resolution
 * - foreign_keys = ON with active verification (never silently swallowed)
 */
export async function ensureDatabasePragmas(): Promise<{ wal: boolean; foreignKeys: boolean }> {
  if (!dbUrl.startsWith("file:")) {
    return { wal: true, foreignKeys: true };
  }

  try {
    await sqliteClient.execute("PRAGMA journal_mode = WAL;");
    await sqliteClient.execute("PRAGMA busy_timeout = 5000;");
    await sqliteClient.execute("PRAGMA foreign_keys = ON;");

    const check = await sqliteClient.execute("PRAGMA foreign_keys;");
    const val = check.rows[0]?.[0];
    const isFkOn = val === 1 || val === 1n || val === "1";

    if (!isFkOn) {
      throw new Error(`[SQLITE INTEGRITY] PRAGMA foreign_keys failed to enable. Received value: ${val}`);
    }

    return { wal: true, foreignKeys: true };
  } catch (err: unknown) {
    console.error("[FATAL DATABASE] Failed to configure SQLite PRAGMAs:", err);
    throw err;
  }
}

// Ensure pragmas on startup for local file storage
if (dbUrl.startsWith("file:")) {
  ensureDatabasePragmas().catch((err) => {
    console.error("[DATABASE INITIALIZATION ERROR]", err);
  });
}

export const db = drizzle(sqliteClient, { schema });
export { schema };

