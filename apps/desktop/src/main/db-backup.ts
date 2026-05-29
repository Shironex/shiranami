/**
 * Database backup, snapshot rotation, and export/import.
 *
 * Lives in the desktop main layer (NOT in @shiranami/database) because it uses
 * the real better-sqlite3 `.backup()` API, which is async and absent from the
 * sql.js test mock the database package's tests run against. Keeping it here
 * leaves `initializeDatabase` synchronous and mock-friendly.
 *
 * On launch we take a WAL-aware snapshot of the live DB file BEFORE migrations
 * run, so a bad upgrade always leaves a pre-migration copy. Snapshots are
 * rotated, keeping the most recent N.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { assertNotDowngrade } from '@shiranami/database/client';
import { logger } from './logger';

/** How many launch snapshots to retain. */
export const MAX_BACKUPS = 5;

/** SQLite file magic header — the first 16 bytes of every SQLite database. */
const SQLITE_MAGIC = 'SQLite format 3\0';

/** Directory holding rotated launch snapshots, alongside the live DB. */
export function getBackupDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'backups');
}

/** Returns true if the file at `filePath` begins with the SQLite magic header. */
export function isSqliteFile(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    return read === 16 && buf.toString('binary') === SQLITE_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/**
 * Take a WAL-aware snapshot of the live database into the rotating backup
 * directory, then prune to the most recent `MAX_BACKUPS`. Best-effort: never
 * throws (a backup failure must not block launch). Returns the snapshot path,
 * or null if nothing was backed up (e.g. fresh install, no DB yet).
 */
export async function backupDatabaseOnLaunch(dbPath: string): Promise<string | null> {
  if (!fs.existsSync(dbPath)) {
    // Fresh install — nothing to snapshot yet.
    return null;
  }

  const backupDir = getBackupDir(dbPath);
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `shiranami-${stamp}.db`);

    // better-sqlite3's .backup() uses the online backup API, which is WAL-aware
    // and produces a consistent copy without needing an explicit checkpoint.
    const source = new Database(dbPath, { readonly: true });
    try {
      await source.backup(dest);
    } finally {
      source.close();
    }

    pruneBackups(backupDir);
    logger.info(`[db-backup] Launch snapshot written: ${path.basename(dest)}`);
    return dest;
  } catch (err) {
    logger.warn('[db-backup] Launch snapshot failed (continuing):', err);
    return null;
  }
}

/** Remove all but the most recent `MAX_BACKUPS` snapshots in `backupDir`. */
function pruneBackups(backupDir: string): void {
  const entries = fs
    .readdirSync(backupDir)
    .filter(name => name.startsWith('shiranami-') && name.endsWith('.db'))
    .sort(); // ISO-ish timestamps sort lexicographically by age
  const excess = entries.length - MAX_BACKUPS;
  for (let i = 0; i < excess; i++) {
    try {
      fs.unlinkSync(path.join(backupDir, entries[i]));
    } catch {
      /* ignore individual prune failures */
    }
  }
}

/**
 * Export a consistent copy of the live database to `destPath` (a user-chosen
 * file). Uses the same online backup API as the launch snapshot.
 */
export async function exportDatabase(dbPath: string, destPath: string): Promise<void> {
  const source = new Database(dbPath, { readonly: true });
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }
}

/**
 * Replace the live database file with `sourcePath` (a user-chosen backup).
 *
 * The caller is responsible for closing the live DB connection BEFORE calling
 * this and re-initializing AFTER (so migrations run against the imported file).
 * A safety copy of the current DB is taken first so a failed import is
 * recoverable. Throws if the source isn't a valid SQLite file.
 */
export async function importDatabase(dbPath: string, sourcePath: string): Promise<void> {
  if (!isSqliteFile(sourcePath)) {
    throw new Error('The selected file is not a valid SQLite database.');
  }

  // Refuse a backup stamped by a newer app build BEFORE we overwrite the live
  // file — otherwise the downgrade guard would only fire post-swap, after the
  // working database had already been destroyed. The pragma read returns 0 for
  // an unstamped/legacy backup, which passes the guard (and is then baselined
  // on re-open). Tolerate a missing pragma (→ 0) so this is a no-op under the
  // sql.js test mock.
  const probe = new Database(sourcePath, { readonly: true });
  try {
    const row = probe.prepare('PRAGMA user_version').get() as
      | { user_version?: number }
      | number
      | undefined;
    const version = typeof row === 'number' ? row : (row?.user_version ?? 0);
    assertNotDowngrade(version);
  } finally {
    probe.close();
  }

  // Snapshot the current DB next to the backups so a bad import is recoverable.
  if (fs.existsSync(dbPath)) {
    await backupDatabaseOnLaunch(dbPath);
  }

  // Atomically replace the main file. Copy to a temp file first, then rename
  // into place — fs.copyFileSync is not atomic, so a mid-copy failure (disk
  // full, interruption) would otherwise leave a corrupted file at dbPath. On
  // failure, unlink the temp and rethrow so the original DB + sidecars survive.
  const tmpPath = `${dbPath}.tmp`;
  try {
    fs.copyFileSync(sourcePath, tmpPath);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }

  // Only after the new file is safely in place, remove stale WAL/SHM sidecars
  // so the imported file isn't reinterpreted through a leftover write-ahead log.
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      try {
        fs.unlinkSync(sidecar);
      } catch {
        /* ignore */
      }
    }
  }
}
