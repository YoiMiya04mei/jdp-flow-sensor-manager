import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "../src/server/db";
import { sql } from "drizzle-orm";

async function backupDatabase(): Promise<void> {
  console.log("==================================================");
  console.log("  JDP NOC - SQLite Database Backup Utility");
  console.log("==================================================");

  const dbDir = path.resolve(process.cwd(), "data");
  const dbFile = path.join(dbDir, "jdp_noc.db");
  const backupsDir = path.join(dbDir, "backups");

  if (!fs.existsSync(dbFile)) {
    console.error(`[ERROR] Database file not found at: ${dbFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
    console.log(`[INFO] Created backups directory: ${backupsDir}`);
  }

  // 1. Flush WAL logs to main database file
  console.log("[1/3] Checkpointing SQLite WAL to ensure atomic snapshot...");
  try {
    await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE);`);
    console.log("      WAL checkpoint successful (TRUNCATE).");
  } catch (err: unknown) {
    console.warn("      Warning: WAL checkpoint command returned:", err);
  }

  // 2. Create timestamped copy
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .split(".")[0];
  const backupFileName = `jdp_noc_backup_${timestamp}.db`;
  const backupFilePath = path.join(backupsDir, backupFileName);

  console.log(`[2/3] Copying database file to ${backupFileName}...`);
  fs.copyFileSync(dbFile, backupFilePath);

  // 3. Compute SHA-256 Checksum
  console.log("[3/3] Calculating SHA-256 checksum...");
  const fileBuffer = fs.readFileSync(backupFilePath);
  const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const checksumPath = `${backupFilePath}.sha256`;
  fs.writeFileSync(checksumPath, `${hash}  ${backupFileName}\n`, "utf8");

  const stat = fs.statSync(backupFilePath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

  console.log("--------------------------------------------------");
  console.log(`[SUCCESS] Backup completed successfully!`);
  console.log(`  File:     ${backupFilePath}`);
  console.log(`  Size:     ${sizeMb} MB (${stat.size} bytes)`);
  console.log(`  Checksum: ${hash}`);
  console.log("--------------------------------------------------");

  // Prune old backups, retain latest 10
  const allBackups = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("jdp_noc_backup_") && f.endsWith(".db"))
    .sort();

  if (allBackups.length > 10) {
    const toDelete = allBackups.slice(0, allBackups.length - 10);
    for (const oldFile of toDelete) {
      const oldPath = path.join(backupsDir, oldFile);
      const oldChecksum = `${oldPath}.sha256`;
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      if (fs.existsSync(oldChecksum)) fs.unlinkSync(oldChecksum);
      console.log(`[RETENTION] Pruned old backup: ${oldFile}`);
    }
  }

  process.exit(0);
}

backupDatabase().catch((err) => {
  console.error("[FATAL] Backup failed:", err);
  process.exit(1);
});

