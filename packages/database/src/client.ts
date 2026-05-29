/**
 * Database client setup
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema/index.js';
import { runMigrations } from './migrate.js';

export { runMigrations, SCHEMA_VERSION, assertNotDowngrade } from './migrate.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteDb: Database.Database | null = null;

export interface DatabaseOptions {
  /** Path to the SQLite database file */
  path: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Initialize the database connection and create tables if they don't exist
 */
export function initializeDatabase(
  options: DatabaseOptions
): ReturnType<typeof drizzle<typeof schema>> {
  if (db) {
    return db;
  }

  try {
    sqliteDb = new Database(options.path, {
      verbose: options.verbose ? console.log : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('NODE_MODULE_VERSION') ||
      message.includes('was compiled against a different Node.js version')
    ) {
      throw new Error(
        `better-sqlite3 ABI mismatch — run \`pnpm rebuild:electron\` to rebuild for the current Electron version.`,
        { cause: err }
      );
    }
    throw err;
  }

  // Enable WAL mode for better concurrent access
  sqliteDb.pragma('journal_mode = WAL');
  // Enable foreign keys
  sqliteDb.pragma('foreign_keys = ON');

  // Verify the file isn't corrupt before we operate on it. quick_check is a
  // fast structural pass; integrity_check is the thorough one. Both return the
  // single row 'ok' on a healthy database.
  runIntegrityChecks(sqliteDb);

  // Apply versioned migrations (creates tables on a fresh DB, baselines and
  // upgrades legacy/older DBs). Replaces the old createTables/migrateSchema.
  runMigrations(sqliteDb);

  db = drizzle({ client: sqliteDb, schema });

  return db;
}

/**
 * Run SQLite's built-in corruption checks. Logs a warning on failure rather
 * than throwing — a partially-readable database is still worth opening so the
 * user can export/recover, and the launch-time backup provides a fallback.
 */
function runIntegrityChecks(database: Database.Database): void {
  try {
    const quick = database.pragma('quick_check', { simple: true });
    if (quick && quick !== 'ok') {
      console.warn(`[database] quick_check reported: ${String(quick)}`);
    }
    const integrity = database.pragma('integrity_check', { simple: true });
    if (integrity && integrity !== 'ok') {
      console.warn(`[database] integrity_check reported: ${String(integrity)}`);
    }
  } catch (err) {
    console.warn('[database] integrity check failed to run:', err);
  }
}


/**
 * Get the current database instance
 */
export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    db = null;
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}
