import type { SQLiteDatabase } from 'expo-sqlite';

type Migration = string[];

export const MIGRATIONS: Record<number, Migration> = {
  1: [
    // Tracks table
    `CREATE TABLE IF NOT EXISTS tracks (
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
    )`,
    // Playlists table
    `CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cover_art TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // Playlist tracks join table
    `CREATE TABLE IF NOT EXISTS playlist_tracks (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      UNIQUE(playlist_id, track_id)
    )`,
    // Radio favorites table
    `CREATE TABLE IF NOT EXISTS radio_favorites (
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
    )`,
    // Listening history table
    `CREATE TABLE IF NOT EXISTS play_history (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TEXT NOT NULL DEFAULT (datetime('now')),
      played_seconds REAL NOT NULL,
      completion_ratio REAL NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'library'
    )`,
    // YouTube mappings table
    `CREATE TABLE IF NOT EXISTS youtube_mappings (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
      youtube_id TEXT NOT NULL,
      searched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // Settings key-value table
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path)`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album)`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(is_favorite)`,
    `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id)`,
    `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id)`,
    `CREATE INDEX IF NOT EXISTS idx_radio_favorites_station_uuid ON radio_favorites(station_uuid)`,
    `CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id)`,
    `CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at)`,
    `CREATE INDEX IF NOT EXISTS idx_youtube_mappings_track_id ON youtube_mappings(track_id)`,
  ],
  // Phone library scan and content identity. Additive only, so it is instant on
  // any library size: existing rows get NULL hashes, filled in the background
  // after startup (lib/library-scan.ts `backfillHashes`), never during it.
  2: [
    // "a1:<hex sha256>", the same value the desktop stores for the same file
    // (crates/shiranami-db/migrations/0009_track_content_hash.sql). Not unique
    // in the schema, but the phone keeps one row per hash: import and scan
    // skip or re-point instead of inserting a second.
    `ALTER TABLE tracks ADD COLUMN content_hash TEXT`,
    `ALTER TABLE tracks ADD COLUMN album_artist TEXT`,
    // Size in bytes and MediaStore DATE_MODIFIED (seconds): a rescan re-reads
    // a file only when one of them moved.
    `ALTER TABLE tracks ADD COLUMN file_size INTEGER`,
    `ALTER TABLE tracks ADD COLUMN file_modified INTEGER`,
    // 'import' (a copy in app storage) or 'device' (a MediaStore content uri).
    `ALTER TABLE tracks ADD COLUMN source TEXT NOT NULL DEFAULT 'import'`,
    // Set when a rescan does not find the file. The row stays, with its
    // favorite, plays and playlists, and comes back if the file does.
    `ALTER TABLE tracks ADD COLUMN missing INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_content_hash ON tracks(content_hash) WHERE content_hash IS NOT NULL`,
  ],
  // LAN sync with the desktop (lib/sync-library.ts). Additive only. Rows the
  // sync adds use source 'desktop': a copy in the app's tracks folder, missing
  // until its audio has downloaded.
  3: [
    // The desktop's track id. Rows the sync created use it as their own id too;
    // a row that already existed and matched by content hash keeps its id and
    // only gains this link.
    `ALTER TABLE tracks ADD COLUMN desktop_id TEXT`,
    // The audio route's ETag (`fileVersion`) of the copy on the phone, so a
    // changed file on the desktop is downloaded again.
    `ALTER TABLE tracks ADD COLUMN desktop_version TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_desktop_id ON tracks(desktop_id) WHERE desktop_id IS NOT NULL`,
  ],
};

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  const applied = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM _migrations ORDER BY version'
  );
  const appliedSet = new Set(applied.map(r => r.version));

  const versions = Object.keys(MIGRATIONS)
    .map(Number)
    .sort((a, b) => a - b);

  for (const version of versions) {
    if (appliedSet.has(version)) continue;

    await db.withTransactionAsync(async () => {
      for (const sql of MIGRATIONS[version]) {
        await db.execAsync(sql);
      }
      await db.runAsync('INSERT INTO _migrations (version) VALUES (?)', [version]);
    });
  }
}
