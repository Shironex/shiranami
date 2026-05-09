/**
 * Database client setup
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema/index.js';

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

  // Create tables if they don't exist
  createTables(sqliteDb);

  // Apply incremental schema migrations for existing databases
  migrateSchema(sqliteDb);

  db = drizzle(sqliteDb, { schema });

  return db;
}

/**
 * Create database tables if they don't exist
 */
function createTables(database: Database.Database): void {
  // Tracks table
  database.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT DEFAULT 'Unknown Artist',
      album TEXT DEFAULT 'Unknown Album',
      duration REAL,
      genre TEXT,
      year INTEGER,
      track_number INTEGER,
      disc_number INTEGER,
      album_art TEXT,
      is_favorite INTEGER DEFAULT 0,
      play_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Playlists table
  database.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cover_art TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Playlist tracks join table
  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      UNIQUE(playlist_id, track_id)
    )
  `);

  // Watched folders table
  database.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      last_scanned TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Radio favorites table
  database.exec(`
    CREATE TABLE IF NOT EXISTS radio_favorites (
      id TEXT PRIMARY KEY,
      station_uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      url_resolved TEXT NOT NULL,
      homepage TEXT,
      favicon TEXT,
      country TEXT,
      country_code TEXT,
      language TEXT,
      codec TEXT,
      bitrate INTEGER,
      tags TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Listening history table
  database.exec(`
    CREATE TABLE IF NOT EXISTS play_history (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TEXT NOT NULL DEFAULT (datetime('now')),
      played_seconds REAL NOT NULL,
      completion_ratio REAL NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'library'
    )
  `);

  // YouTube mappings table
  database.exec(`
    CREATE TABLE IF NOT EXISTS youtube_mappings (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
      youtube_id TEXT NOT NULL,
      searched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create indexes for common queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
    CREATE INDEX IF NOT EXISTS idx_radio_favorites_station_uuid ON radio_favorites(station_uuid);
    CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_youtube_mappings_track_id ON youtube_mappings(track_id);
  `);
}

/**
 * Apply incremental schema migrations for existing databases.
 *
 * SQLite's ALTER TABLE ADD COLUMN has no IF NOT EXISTS form, so existence is
 * checked via PRAGMA table_info before each additive migration. Keep operations
 * idempotent and append-only.
 */
function migrateSchema(database: Database.Database): void {
  // disc_number: added for multi-disc album support
  if (!hasColumn(database, 'tracks', 'disc_number')) {
    database.prepare('ALTER TABLE tracks ADD COLUMN disc_number INTEGER').run();
  }
}

/**
 * Returns true if `table` has a column named `column`. Uses PRAGMA table_info,
 * which is the canonical SQLite introspection for schema existence checks.
 */
function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some(row => row.name === column);
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
