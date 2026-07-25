/**
 * Versioned schema migrations.
 *
 * Replaces the old `createTables()` (CREATE TABLE IF NOT EXISTS) +
 * `migrateSchema()` (ad-hoc ALTERs) approach with a proper, ledgered migration
 * system built on drizzle-orm's SQLite migrator (`dialect.migrate`).
 *
 * Migration SQL is *embedded* (not read from disk). The desktop app bundles
 * `@shiranami/database` into a single esbuild output and packages it inside an
 * asar archive, so the `drizzle/*` `.sql` files are not reliably present on
 * disk at runtime. Embedding the statements keeps migrations working in every
 * environment (dev, packaged, tests) while still reusing drizzle's tested
 * ledger / `getMigrationsToRun` / transaction logic.
 *
 * The embedded statements are kept in lock-step with the on-disk `drizzle/*`
 * folders by a test (`migrate.test.ts`) that diffs the two.
 */

import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import type Database from 'better-sqlite3';
import * as schema from './schema/index.js';

/** Name of the drizzle migration ledger table. */
const MIGRATIONS_TABLE = '__drizzle_migrations';

/** Name of the baseline migration (matches the `drizzle/` folder name). */
export const BASELINE_NAME = '20260101000000_baseline';

/**
 * The app's current schema version, mirrored into `PRAGMA user_version`.
 * Bump this whenever a migration is added so the downgrade guard can refuse to
 * open a database created by a newer build.
 */
export const SCHEMA_VERSION = 9;

interface EmbeddedMigration {
  /** Folder name — used as the ledger `name` and for ordering. */
  name: string;
  /** SQL statements (already split on `--> statement-breakpoint`). */
  statements: string[];
}

/**
 * Embedded migrations, in apply order. Each entry mirrors the matching
 * `drizzle/<name>/migration.sql` file (statements split on the
 * `--> statement-breakpoint` marker drizzle-kit emits).
 */
const MIGRATIONS: EmbeddedMigration[] = [
  {
    name: BASELINE_NAME,
    statements: [
      `CREATE TABLE \`folders\` (
\t\`id\` text PRIMARY KEY,
\t\`path\` text NOT NULL UNIQUE,
\t\`last_scanned\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE \`play_history\` (
\t\`id\` text PRIMARY KEY,
\t\`track_id\` text NOT NULL,
\t\`played_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`played_seconds\` real NOT NULL,
\t\`completion_ratio\` real NOT NULL,
\t\`completed\` integer DEFAULT false NOT NULL,
\t\`source\` text DEFAULT 'library' NOT NULL,
\tCONSTRAINT \`fk_play_history_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE
)`,
      `CREATE TABLE \`playlist_tracks\` (
\t\`id\` text PRIMARY KEY,
\t\`playlist_id\` text NOT NULL,
\t\`track_id\` text NOT NULL,
\t\`position\` integer NOT NULL,
\tCONSTRAINT \`fk_playlist_tracks_playlist_id_playlists_id_fk\` FOREIGN KEY (\`playlist_id\`) REFERENCES \`playlists\`(\`id\`) ON DELETE CASCADE,
\tCONSTRAINT \`fk_playlist_tracks_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE,
\tCONSTRAINT \`playlist_tracks_playlist_id_track_id_unique\` UNIQUE(\`playlist_id\`,\`track_id\`)
)`,
      `CREATE TABLE \`playlists\` (
\t\`id\` text PRIMARY KEY,
\t\`name\` text NOT NULL,
\t\`description\` text,
\t\`cover_art\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`updated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE \`radio_favorites\` (
\t\`id\` text PRIMARY KEY,
\t\`station_uuid\` text NOT NULL UNIQUE,
\t\`name\` text NOT NULL,
\t\`url\` text NOT NULL,
\t\`url_resolved\` text NOT NULL,
\t\`homepage\` text,
\t\`favicon\` text,
\t\`country\` text,
\t\`country_code\` text,
\t\`language\` text,
\t\`codec\` text,
\t\`bitrate\` integer,
\t\`tags\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE \`recommendations\` (
\t\`kind\` text PRIMARY KEY,
\t\`payload\` text NOT NULL,
\t\`generated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE \`tracks\` (
\t\`id\` text PRIMARY KEY,
\t\`file_path\` text NOT NULL UNIQUE,
\t\`title\` text NOT NULL,
\t\`artist\` text DEFAULT 'Unknown Artist',
\t\`album\` text DEFAULT 'Unknown Album',
\t\`duration\` real,
\t\`genre\` text,
\t\`year\` integer,
\t\`track_number\` integer,
\t\`disc_number\` integer,
\t\`album_art\` text,
\t\`is_favorite\` integer DEFAULT false,
\t\`play_count\` integer DEFAULT 0,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`updated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE \`youtube_mappings\` (
\t\`id\` text PRIMARY KEY,
\t\`track_id\` text NOT NULL UNIQUE,
\t\`youtube_id\` text NOT NULL,
\t\`searched_at\` text DEFAULT (datetime('now')) NOT NULL,
\tCONSTRAINT \`fk_youtube_mappings_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE
)`,
      'CREATE INDEX IF NOT EXISTS `idx_tracks_file_path` ON `tracks`(`file_path`)',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_artist` ON `tracks`(`artist`)',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_album` ON `tracks`(`album`)',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_is_favorite` ON `tracks`(`is_favorite`)',
      'CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_id` ON `playlist_tracks`(`playlist_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_track_id` ON `playlist_tracks`(`track_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_folders_path` ON `folders`(`path`)',
      'CREATE INDEX IF NOT EXISTS `idx_radio_favorites_station_uuid` ON `radio_favorites`(`station_uuid`)',
      'CREATE INDEX IF NOT EXISTS `idx_play_history_track_id` ON `play_history`(`track_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_play_history_played_at` ON `play_history`(`played_at`)',
      'CREATE INDEX IF NOT EXISTS `idx_youtube_mappings_track_id` ON `youtube_mappings`(`track_id`)',
    ],
  },
  {
    name: '20260101000001_album_artist',
    statements: [
      'ALTER TABLE `tracks` ADD `album_artist` text',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_album_artist` ON `tracks`(`album_artist`)',
    ],
  },
  {
    name: '20260101000002_track_loudness',
    statements: ['ALTER TABLE `tracks` ADD `loudness_lufs` real'],
  },
  {
    name: '20260101000003_negative_signals',
    statements: [
      `CREATE TABLE \`negative_signals\` (
\t\`id\` text PRIMARY KEY,
\t\`track_id\` text NOT NULL UNIQUE,
\t\`artist\` text,
\t\`source\` text DEFAULT 'context-menu' NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\tCONSTRAINT \`fk_negative_signals_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE
)`,
      'CREATE INDEX IF NOT EXISTS `idx_negative_signals_track_id` ON `negative_signals`(`track_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_negative_signals_artist` ON `negative_signals`(`artist`)',
    ],
  },
  {
    name: '20260101000004_smart_playlists',
    statements: [
      `CREATE TABLE \`smart_playlists\` (
\t\`id\` text PRIMARY KEY,
\t\`name\` text NOT NULL,
\t\`description\` text,
\t\`match_type\` text DEFAULT 'all' NOT NULL,
\t\`rules\` text DEFAULT '[]' NOT NULL,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`updated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
    ],
  },
  {
    name: '20260101000005_download_queue',
    statements: [
      `CREATE TABLE \`download_queue\` (
\t\`id\` text PRIMARY KEY,
\t\`url\` text NOT NULL,
\t\`youtube_id\` text,
\t\`title\` text NOT NULL,
\t\`thumbnail\` text,
\t\`status\` text NOT NULL,
\t\`file_path\` text,
\t\`batch_id\` text,
\t\`batch_index\` integer,
\t\`batch_source_title\` text,
\t\`batch_create_playlist\` integer,
\t\`enqueued_at\` integer NOT NULL,
\t\`started_at\` integer,
\t\`finished_at\` integer
)`,
    ],
  },
  {
    // Un-bake the track artist from album_artist: where album_artist merely
    // mirrors the track artist (a fallback baked in for files with no
    // albumartist tag), reset it to NULL ("untagged") so the grouping layer
    // falls back to the album title alone and untagged various-artists albums
    // stay one album. Idempotent: once nulled, `album_artist = artist` stops
    // matching (NULL = artist is NULL).
    //
    // Tradeoff (accepted): the WHERE cannot tell a baked fallback from a genuine
    // albumartist tag that legitimately equals the artist (a solo album). It
    // nulls both, so two same-titled solo albums by different artists MERGE
    // (they key on the title alone) — rare. The on-disk tag is untouched: the
    // scan layer never bakes the fallback, so a genuine albumartist==artist tag
    // re-populates on the next rescan, restoring separation.
    name: '20260101000006_unbake_album_artist',
    statements: ['UPDATE `tracks` SET `album_artist` = NULL WHERE `album_artist` = `artist`'],
  },
  {
    // Heal legacy databases that were baselined (markBaseline) while missing
    // baseline-era tables. The legacy boot path created tables additively via
    // CREATE TABLE IF NOT EXISTS as features shipped (play_history in v0.10,
    // recommendations in v0.20, …), so a user jumping from e.g. v0.9 straight
    // to a migrator build has `tracks` but not the later tables. markBaseline
    // stamps the baseline as applied without running DDL, leaving those tables
    // permanently absent while user_version reads "current". Re-running the
    // baseline DDL as CREATE TABLE / INDEX IF NOT EXISTS restores anything
    // missing and is a no-op on an already-complete (fresh or v7) database.
    //
    // The `disc_number` column heal is NOT here: SQLite has no
    // `ADD COLUMN IF NOT EXISTS`, and these embedded statements run as raw SQL
    // inside drizzle's migrator (no per-statement guard). It is applied as a
    // PRAGMA-guarded JS step in runMigrations() before the migrator runs.
    name: '20260101000007_heal_legacy_tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS \`folders\` (
\t\`id\` text PRIMARY KEY,
\t\`path\` text NOT NULL UNIQUE,
\t\`last_scanned\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS \`play_history\` (
\t\`id\` text PRIMARY KEY,
\t\`track_id\` text NOT NULL,
\t\`played_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`played_seconds\` real NOT NULL,
\t\`completion_ratio\` real NOT NULL,
\t\`completed\` integer DEFAULT false NOT NULL,
\t\`source\` text DEFAULT 'library' NOT NULL,
\tCONSTRAINT \`fk_play_history_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE
)`,
      `CREATE TABLE IF NOT EXISTS \`playlist_tracks\` (
\t\`id\` text PRIMARY KEY,
\t\`playlist_id\` text NOT NULL,
\t\`track_id\` text NOT NULL,
\t\`position\` integer NOT NULL,
\tCONSTRAINT \`fk_playlist_tracks_playlist_id_playlists_id_fk\` FOREIGN KEY (\`playlist_id\`) REFERENCES \`playlists\`(\`id\`) ON DELETE CASCADE,
\tCONSTRAINT \`fk_playlist_tracks_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE,
\tCONSTRAINT \`playlist_tracks_playlist_id_track_id_unique\` UNIQUE(\`playlist_id\`,\`track_id\`)
)`,
      `CREATE TABLE IF NOT EXISTS \`playlists\` (
\t\`id\` text PRIMARY KEY,
\t\`name\` text NOT NULL,
\t\`description\` text,
\t\`cover_art\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`updated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS \`radio_favorites\` (
\t\`id\` text PRIMARY KEY,
\t\`station_uuid\` text NOT NULL UNIQUE,
\t\`name\` text NOT NULL,
\t\`url\` text NOT NULL,
\t\`url_resolved\` text NOT NULL,
\t\`homepage\` text,
\t\`favicon\` text,
\t\`country\` text,
\t\`country_code\` text,
\t\`language\` text,
\t\`codec\` text,
\t\`bitrate\` integer,
\t\`tags\` text,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS \`recommendations\` (
\t\`kind\` text PRIMARY KEY,
\t\`payload\` text NOT NULL,
\t\`generated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS \`tracks\` (
\t\`id\` text PRIMARY KEY,
\t\`file_path\` text NOT NULL UNIQUE,
\t\`title\` text NOT NULL,
\t\`artist\` text DEFAULT 'Unknown Artist',
\t\`album\` text DEFAULT 'Unknown Album',
\t\`duration\` real,
\t\`genre\` text,
\t\`year\` integer,
\t\`track_number\` integer,
\t\`disc_number\` integer,
\t\`album_art\` text,
\t\`is_favorite\` integer DEFAULT false,
\t\`play_count\` integer DEFAULT 0,
\t\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
\t\`updated_at\` text DEFAULT (datetime('now')) NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS \`youtube_mappings\` (
\t\`id\` text PRIMARY KEY,
\t\`track_id\` text NOT NULL UNIQUE,
\t\`youtube_id\` text NOT NULL,
\t\`searched_at\` text DEFAULT (datetime('now')) NOT NULL,
\tCONSTRAINT \`fk_youtube_mappings_track_id_tracks_id_fk\` FOREIGN KEY (\`track_id\`) REFERENCES \`tracks\`(\`id\`) ON DELETE CASCADE
)`,
      'CREATE INDEX IF NOT EXISTS `idx_tracks_file_path` ON `tracks`(`file_path`)',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_artist` ON `tracks`(`artist`)',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_album` ON `tracks`(`album`)',
      'CREATE INDEX IF NOT EXISTS `idx_tracks_is_favorite` ON `tracks`(`is_favorite`)',
      'CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_id` ON `playlist_tracks`(`playlist_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_track_id` ON `playlist_tracks`(`track_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_folders_path` ON `folders`(`path`)',
      'CREATE INDEX IF NOT EXISTS `idx_radio_favorites_station_uuid` ON `radio_favorites`(`station_uuid`)',
      'CREATE INDEX IF NOT EXISTS `idx_play_history_track_id` ON `play_history`(`track_id`)',
      'CREATE INDEX IF NOT EXISTS `idx_play_history_played_at` ON `play_history`(`played_at`)',
      'CREATE INDEX IF NOT EXISTS `idx_youtube_mappings_track_id` ON `youtube_mappings`(`track_id`)',
    ],
  },
  {
    // Indexes for the two hot ordered reads, both of which previously paid for a
    // temp B-tree sort on every call:
    //
    // - `tracks(created_at)` serves `SELECT * FROM tracks ORDER BY created_at
    //   DESC` — the whole-library load (`tracks:get-all`), `tracks:get-favorites`
    //   and smart-playlist evaluation. SQLite walks the index in reverse instead
    //   of scanning the table and sorting it.
    // - `playlist_tracks(playlist_id, position)` serves
    //   `WHERE playlist_id = ? ORDER BY position` — every playlist open
    //   (`playlists:get-tracks`, share export) — and covers the
    //   `MAX(position)` probe the add-track paths run before inserting.
    //
    // The single-column `idx_playlist_tracks_playlist_id` is dropped: the
    // composite has `playlist_id` as its leftmost column, so it serves every
    // lookup the old index did while costing one fewer B-tree write per row.
    //
    // The smart-playlist filter columns (`genre`, `year`, `play_count`) are
    // deliberately NOT indexed: their rules are dominated by `contains` (LIKE
    // '%…%', unindexable) and `isNot`, the columns are low-cardinality, and every
    // evaluation already ends in the `created_at` ordering indexed above.
    name: '20260101000008_query_indexes',
    statements: [
      'CREATE INDEX IF NOT EXISTS `idx_tracks_created_at` ON `tracks`(`created_at`)',
      'CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_position` ON `playlist_tracks`(`playlist_id`,`position`)',
      'DROP INDEX IF EXISTS `idx_playlist_tracks_playlist_id`',
    ],
  },
];

/**
 * Parse a `YYYYMMDDHHMMSS_*` folder name into epoch millis, matching drizzle's
 * own `formatToMillis`. Used for the ledger `created_at` / ordering.
 */
function folderMillis(name: string): number {
  const d = name.slice(0, 14);
  const year = parseInt(d.slice(0, 4), 10);
  const month = parseInt(d.slice(4, 6), 10) - 1;
  const day = parseInt(d.slice(6, 8), 10);
  const hour = parseInt(d.slice(8, 10), 10);
  const minute = parseInt(d.slice(10, 12), 10);
  const second = parseInt(d.slice(12, 14), 10);
  return Date.UTC(year, month, day, hour, minute, second);
}

/**
 * Build the `MigrationMeta[]` array drizzle's migrator expects from the
 * embedded migrations. The hash mirrors drizzle-kit: sha256 of the joined SQL
 * (statements rejoined with the breakpoint marker, matching the on-disk file).
 */
function buildMigrationMetas(): MigrationMeta[] {
  return MIGRATIONS.map(m => {
    const joined = m.statements.join('--> statement-breakpoint');
    return {
      sql: m.statements,
      bps: true,
      folderMillis: folderMillis(m.name),
      hash: createHash('sha256').update(joined).digest('hex'),
      name: m.name,
    };
  });
}

/**
 * Returns true if the database already holds application tables but has no
 * drizzle migration ledger — i.e. it was created by the legacy
 * `createTables()` path and predates versioned migrations.
 */
function isLegacyUnversionedDb(sqlite: Database.Database): boolean {
  const ledger = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
    .get(MIGRATIONS_TABLE);
  if (ledger) return false;

  const tracks = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='tracks'`)
    .get();
  return Boolean(tracks);
}

/**
 * Mark the baseline migration as already applied WITHOUT running its SQL.
 *
 * Used for legacy databases whose tables were created by the old
 * CREATE-IF-NOT-EXISTS path. Creates the drizzle ledger in its current
 * (version 1) shape and inserts the baseline row so the migrator skips it and
 * only applies migrations newer than the baseline.
 */
function markBaseline(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric,
      name text,
      applied_at TEXT
    )
  `);

  const [baseline] = buildMigrationMetas();
  if (!baseline) return;

  sqlite
    .prepare(
      `INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at", "name", "applied_at") VALUES (?, ?, ?, ?)`
    )
    .run(baseline.hash, baseline.folderMillis, baseline.name, new Date().toISOString());
}

/**
 * Heal the `tracks.disc_number` column on legacy databases that predate it.
 *
 * The old boot path added `disc_number` via an ad-hoc PRAGMA-guarded ALTER
 * (`9c0d0564~1:packages/database/src/client.ts`). A user who upgraded before
 * that ALTER shipped — or whose `tracks` table predates multi-disc support —
 * can reach the migrator without the column. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, and the embedded migration SQL runs unguarded
 * inside drizzle's migrator, so the guard lives here in JS instead: introspect
 * via `PRAGMA table_info` and ALTER only when absent. No-op on every current DB.
 */
function healDiscNumberColumn(sqlite: Database.Database): void {
  const hasTracks = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='tracks'`)
    .get();
  if (!hasTracks) return;

  const columns = sqlite.prepare(`PRAGMA table_info(tracks)`).all() as Array<{ name: string }>;
  if (columns.some(c => c.name === 'disc_number')) return;

  sqlite.exec('ALTER TABLE `tracks` ADD COLUMN `disc_number` integer');
}

/**
 * Compare two schema versions. Throws if `dbVersion` is newer than the app's
 * current `SCHEMA_VERSION` (a downgrade), which would risk data loss if the
 * older build tried to operate on a newer schema.
 *
 * Extracted as a pure function so it can be unit-tested without a live pragma
 * round-trip (the test mock does not persist `PRAGMA user_version`).
 */
export function assertNotDowngrade(dbVersion: number, appVersion: number = SCHEMA_VERSION): void {
  if (dbVersion > appVersion) {
    throw new Error(
      `Database schema version ${dbVersion} is newer than this app supports (${appVersion}). ` +
        `Please update Shiranami to open this library.`
    );
  }
}

/**
 * Run all pending migrations against a raw better-sqlite3 handle.
 *
 * - Fresh DB: drizzle's migrator creates every table from the baseline upward.
 * - Legacy unversioned DB: the baseline is marked as applied (no SQL run) so
 *   existing tables/data are preserved; the disc_number column is healed if
 *   absent, then only newer migrations run (the heal migration re-creates any
 *   baseline-era table the additive legacy boot path never created).
 * - Already-versioned DB: only newer-than-recorded migrations run.
 *
 * Idempotent: a second call applies nothing.
 *
 * Exported taking a raw handle (rather than living inside `initializeDatabase`)
 * so tests can seed a connection and migrate it on the SAME handle — the test
 * mock gives each `new Database()` an isolated in-memory store, so reopen-based
 * tests are impossible.
 */
export function runMigrations(sqlite: Database.Database): void {
  // Downgrade guard — refuse to open a DB stamped newer than this build.
  const versionRow = sqlite.prepare('PRAGMA user_version').get() as
    | { user_version?: number }
    | number
    | undefined;
  const dbVersion = typeof versionRow === 'number' ? versionRow : (versionRow?.user_version ?? 0);
  assertNotDowngrade(dbVersion);

  if (isLegacyUnversionedDb(sqlite)) {
    markBaseline(sqlite);
  }

  // Heal a missing tracks.disc_number column on pre-multi-disc legacy DBs.
  // PRAGMA-guarded (SQLite has no ADD COLUMN IF NOT EXISTS); no-op otherwise.
  healDiscNumberColumn(sqlite);

  const db = drizzle({ client: sqlite, schema });
  const migrations = buildMigrationMetas();
  // This is drizzle's own better-sqlite3 migrator entry point (what
  // `migrate()` calls after reading files from disk). It manages the ledger,
  // computes pending migrations, and runs them in a transaction. `dialect` and
  // `session` are internal handles not in the public type surface, so we reach
  // them the same way drizzle's own `migrate()` does.
  const internal = db as unknown as {
    dialect: { migrate: (m: MigrationMeta[], s: unknown, c: { migrationsTable: string }) => void };
    session: unknown;
  };
  internal.dialect.migrate(migrations, internal.session, { migrationsTable: MIGRATIONS_TABLE });

  // Stamp the schema version for the downgrade guard on subsequent opens.
  sqlite.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Exposed for the lock-step test that diffs embedded SQL against disk. */
export const __embeddedMigrationsForTest = MIGRATIONS;
