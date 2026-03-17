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
  options: DatabaseOptions,
): ReturnType<typeof drizzle<typeof schema>> {
  if (db) {
    return db;
  }

  sqliteDb = new Database(options.path, {
    verbose: options.verbose ? console.log : undefined,
  });

  // Enable WAL mode for better concurrent access
  sqliteDb.pragma('journal_mode = WAL');
  // Enable foreign keys
  sqliteDb.pragma('foreign_keys = ON');

  // Create tables if they don't exist
  createTables(sqliteDb);

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

  // Create indexes for common queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
  `);
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
