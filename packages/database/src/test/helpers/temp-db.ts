import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { closeDatabase, initializeDatabase } from '../../client.js';

/**
 * Creates a unique temp directory under os.tmpdir() for isolated SQLite files.
 * Call `closeDatabase()` (or `cleanupTempDbDir`) after tests — the DB client is a singleton.
 */
export function makeTempDbDir(): string {
  return mkdtempSync(join(tmpdir(), 'shiranami-db-'));
}

export function tempSqlitePath(dir: string): string {
  return join(dir, `${randomUUID()}.sqlite`);
}

export function cleanupTempDbDir(dir: string): void {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
}

export function openTempDatabase(dir: string) {
  const path = tempSqlitePath(dir);
  return { path, db: initializeDatabase({ path }) };
}
