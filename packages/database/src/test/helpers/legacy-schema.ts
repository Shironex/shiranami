/**
 * Legacy schema creation, frozen as it existed BEFORE versioned migrations.
 *
 * The production `client.ts` used to create tables via these
 * CREATE TABLE IF NOT EXISTS statements (plus an ad-hoc disc_number ALTER).
 * It now uses the versioned migrator instead. This helper preserves the exact
 * legacy DDL so tests can reproduce an "old-format" user database — one with
 * real tables/data but NO `__drizzle_migrations` ledger — and assert the new
 * migrator baselines and upgrades it without data loss.
 *
 * Do NOT use this in production code.
 */

import type Database from 'better-sqlite3';

/** Recreate the pre-migration database schema (legacy createTables path). */
export function createLegacyTables(database: Database.Database): void {
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

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      UNIQUE(playlist_id, track_id)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      last_scanned TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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

  database.exec(`
    CREATE TABLE IF NOT EXISTS youtube_mappings (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
      youtube_id TEXT NOT NULL,
      searched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS recommendations (
      kind TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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
 * Recreate a much OLDER legacy database — the additive boot path mid-history,
 * before later features shipped their tables. This reproduces the data-loss
 * hole: a user who jumped from e.g. v0.9 straight to a migrator build has only
 * the `tracks` table (no play_history/recommendations/playlists/etc.) and a
 * `tracks` shape that predates the `disc_number` ALTER.
 *
 * Used to assert the heal migration restores every missing baseline-era table
 * and the disc_number column without data loss. Do NOT use in production code.
 */
export function createOldEraLegacyTracksTable(database: Database.Database): void {
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

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(is_favorite);
  `);
}
