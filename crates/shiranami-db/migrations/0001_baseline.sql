-- The v1 schema, squashed.
--
-- This is the sum of drizzle migrations 20260101000000_baseline through
-- 20260101000008_query_indexes as they stand at the port (architecture §3.2,
-- decision D14). It has two callers with opposite needs:
--
--   * a fresh v2 install runs it for real, and gets the schema a v1 user
--     already has;
--   * an adopted v1 database gets it *stamped* into `_sqlx_migrations` without
--     the DDL running, because the tables are already there with the user's
--     data in them.
--
-- Everything is therefore `IF NOT EXISTS`: the squash must be safe to re-run
-- against a populated database, since that is the failure mode that loses a
-- library (risk R6). SQLite drops `IF NOT EXISTS` when it stores a statement in
-- `sqlite_master`, so the clause costs nothing in the schema text either side
-- compares.
--
-- `crates/shiranami-db/tests/schema_equivalence.rs` proves this file and the
-- drizzle chain produce the same schema. Do not edit it without re-running that
-- test — a divergence here is invisible until a real user's database is already
-- being queried against a schema nobody checked.
--
-- Three details that look like mistakes and are not:
--
--   1. `tracks` lists `album_artist` and `loudness_lufs` last. They arrived as
--      `ALTER TABLE ... ADD COLUMN` in migrations 001 and 002, and SQLite
--      appends an added column to the end of the table, so that is where a v1
--      database has them.
--   2. There is no `idx_playlist_tracks_playlist_id`. Migration 008 dropped it:
--      the composite `(playlist_id, position)` has `playlist_id` as its
--      leftmost column, so it serves every lookup the single-column index did
--      at one fewer B-tree write per row.
--   3. The `unbake_album_artist` UPDATE from migration 006 is not here. It is a
--      data migration over rows that only an existing database has; a fresh one
--      has nothing to un-bake. Adoption runs it, once, when the drizzle ledger
--      says v1 never did.

CREATE TABLE IF NOT EXISTS `tracks` (
	`id` text PRIMARY KEY,
	`file_path` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`artist` text DEFAULT 'Unknown Artist',
	`album` text DEFAULT 'Unknown Album',
	`duration` real,
	`genre` text,
	`year` integer,
	`track_number` integer,
	`disc_number` integer,
	`album_art` text,
	`is_favorite` integer DEFAULT false,
	`play_count` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`album_artist` text,
	`loudness_lufs` real
);

CREATE TABLE IF NOT EXISTS `folders` (
	`id` text PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`last_scanned` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `playlists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`cover_art` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `playlist_tracks` (
	`id` text PRIMARY KEY,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT `fk_playlist_tracks_playlist_id_playlists_id_fk` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_playlist_tracks_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE,
	CONSTRAINT `playlist_tracks_playlist_id_track_id_unique` UNIQUE(`playlist_id`,`track_id`)
);

CREATE TABLE IF NOT EXISTS `smart_playlists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`match_type` text DEFAULT 'all' NOT NULL,
	`rules` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `play_history` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL,
	`played_at` text DEFAULT (datetime('now')) NOT NULL,
	`played_seconds` real NOT NULL,
	`completion_ratio` real NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'library' NOT NULL,
	CONSTRAINT `fk_play_history_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `negative_signals` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL UNIQUE,
	`artist` text,
	`source` text DEFAULT 'context-menu' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_negative_signals_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `recommendations` (
	`kind` text PRIMARY KEY,
	`payload` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `youtube_mappings` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL UNIQUE,
	`youtube_id` text NOT NULL,
	`searched_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_youtube_mappings_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `radio_favorites` (
	`id` text PRIMARY KEY,
	`station_uuid` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`url_resolved` text NOT NULL,
	`homepage` text,
	`favicon` text,
	`country` text,
	`country_code` text,
	`language` text,
	`codec` text,
	`bitrate` integer,
	`tags` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `download_queue` (
	`id` text PRIMARY KEY,
	`url` text NOT NULL,
	`youtube_id` text,
	`title` text NOT NULL,
	`thumbnail` text,
	`status` text NOT NULL,
	`file_path` text,
	`batch_id` text,
	`batch_index` integer,
	`batch_source_title` text,
	`batch_create_playlist` integer,
	`enqueued_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);

CREATE INDEX IF NOT EXISTS `idx_tracks_file_path` ON `tracks`(`file_path`);
CREATE INDEX IF NOT EXISTS `idx_tracks_artist` ON `tracks`(`artist`);
CREATE INDEX IF NOT EXISTS `idx_tracks_album` ON `tracks`(`album`);
CREATE INDEX IF NOT EXISTS `idx_tracks_album_artist` ON `tracks`(`album_artist`);
CREATE INDEX IF NOT EXISTS `idx_tracks_is_favorite` ON `tracks`(`is_favorite`);
CREATE INDEX IF NOT EXISTS `idx_folders_path` ON `folders`(`path`);
CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_position` ON `playlist_tracks`(`playlist_id`,`position`);
CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_track_id` ON `playlist_tracks`(`track_id`);
CREATE INDEX IF NOT EXISTS `idx_play_history_track_id` ON `play_history`(`track_id`);
CREATE INDEX IF NOT EXISTS `idx_play_history_played_at` ON `play_history`(`played_at`);
CREATE INDEX IF NOT EXISTS `idx_negative_signals_track_id` ON `negative_signals`(`track_id`);
CREATE INDEX IF NOT EXISTS `idx_negative_signals_artist` ON `negative_signals`(`artist`);
CREATE INDEX IF NOT EXISTS `idx_youtube_mappings_track_id` ON `youtube_mappings`(`track_id`);
CREATE INDEX IF NOT EXISTS `idx_radio_favorites_station_uuid` ON `radio_favorites`(`station_uuid`);
