import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@libsql/client";

async function restoreDatabase(): Promise<void> {
  console.log("==================================================");
  console.log("  JDP NOC - SQLite Database Restore Utility");
  console.log("==================================================");

  const dbDir = path.resolve(process.cwd(), "data");
  const dbFile = path.join(dbDir, "jdp_noc.db");
  const backupsDir = path.join(dbDir, "backups");

  // Determine target backup file
  let targetBackup: string | null = null;
  const argFile = process.argv[2];

  if (argFile) {
    targetBackup = path.isAbsolute(argFile) ? argFile : path.resolve(process.cwd(), argFile);
  } else {
    // Find latest in backupsDir
    if (fs.existsSync(backupsDir)) {
      const backupFiles = fs
        .readdirSync(backupsDir)
        .filter((f) => f.startsWith("jdp_noc_backup_") && f.endsWith(".db"))
        .sort();
      if (backupFiles.length > 0) {
        targetBackup = path.join(backupsDir, backupFiles[backupFiles.length - 1]);
      }
    }
  }

  if (!targetBackup || !fs.existsSync(targetBackup)) {
    console.error(`[ERROR] No valid backup file specified or found.`);
    console.log(`Usage: npx tsx scripts/restore-db.ts [path/to/backup.db]`);
    process.exit(1);
  }

  console.log(`[TARGET] Restoring from: ${targetBackup}`);

  // 1. Verify Checksum if present
  const checksumFile = `${targetBackup}.sha256`;
  if (fs.existsSync(checksumFile)) {
    console.log("[1/4] Verifying SHA-256 checksum integrity...");
    const expected = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
    const fileBytes = fs.readFileSync(targetBackup);
    const actual = crypto.createHash("sha256").update(fileBytes).digest("hex");

    if (expected.toLowerCase() !== actual.toLowerCase()) {
      console.error(`[FATAL] Checksum verification failed!`);
      console.error(`  Expected: ${expected}`);
      console.error(`  Actual:   ${actual}`);
      process.exit(1);
    }
    console.log("      Checksum matched OK.");
  } else {
    console.warn("[1/4] Warning: No .sha256 checksum file found. Skipping checksum verification.");
  }

  // 2. Safety snapshot of current database
  if (fs.existsSync(dbFile)) {
    const safetyCopy = path.join(dbDir, `jdp_noc.db.pre-restore-${Date.now()}`);
    console.log(`[2/4] Creating safety backup of active database to ${path.basename(safetyCopy)}...`);
    fs.copyFileSync(dbFile, safetyCopy);
  }

  // 3. Remove existing WAL & SHM files to prevent corruption
  console.log("[3/4] Purging active WAL/SHM locks and restoring database file...");
  const walFile = `${dbFile}-wal`;
  const shmFile = `${dbFile}-shm`;

  try {
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  } catch (err: any) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.warn("      [WARN] Database file is currently locked by a running process.");
      console.warn("      For full data safety, please stop the Web App (npm run dev/start) and Collector Daemon first.");
    } else {
      throw err;
    }
  }

  try {
    fs.copyFileSync(targetBackup, dbFile);
  } catch (err: any) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.error("[FATAL] Cannot overwrite database file because it is locked by another process.");
      console.error("        Please terminate all active node processes or background collectors and retry.");
      process.exit(1);
    }
    throw err;
  }

  // 4. Verify SQLite Integrity Check
  console.log("[4/4] Verifying SQLite database integrity with PRAGMA integrity_check...");
  try {
    const client = createClient({ url: `file:${dbFile}` });
    const result = await client.execute("PRAGMA integrity_check;");
    await client.close();

    const isOk = result.rows.length > 0 && result.rows[0][0] === "ok";
    if (!isOk) {
      console.error("[FATAL] SQLite integrity check failed:", result.rows);
      process.exit(1);
    }
    console.log("      Integrity check: OK");
  } catch (err: unknown) {
    console.error("[FATAL] Failed to verify restored database:", err);
    process.exit(1);
  }

  console.log("--------------------------------------------------");
  console.log(`[SUCCESS] Database restored and verified successfully!`);
  console.log(`  Active DB: ${dbFile}`);
  console.log("--------------------------------------------------");
  process.exit(0);
}

restoreDatabase().catch((err) => {
  console.error("[FATAL] Restore failed:", err);
  process.exit(1);
});
