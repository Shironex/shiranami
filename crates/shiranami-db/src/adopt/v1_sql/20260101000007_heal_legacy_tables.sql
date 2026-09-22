CREATE TABLE IF NOT EXISTS `folders` (
	`id` text PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`last_scanned` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
)
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `play_history` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL,
	`played_at` text DEFAULT (datetime('now')) NOT NULL,
	`played_seconds` real NOT NULL,
	`completion_ratio` real NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'library' NOT NULL,
	CONSTRAINT `fk_play_history_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
)
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `playlist_tracks` (
	`id` text PRIMARY KEY,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT `fk_playlist_tracks_playlist_id_playlists_id_fk` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_playlist_tracks_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE,
	CONSTRAINT `playlist_tracks_playlist_id_track_id_unique` UNIQUE(`playlist_id`,`track_id`)
)
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `playlists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`cover_art` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
)
--> statement-breakpoint
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
)
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recommendations` (
	`kind` text PRIMARY KEY,
	`payload` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL
)
--> statement-breakpoint
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
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
)
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `youtube_mappings` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL UNIQUE,
	`youtube_id` text NOT NULL,
	`searched_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_youtube_mappings_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracks_file_path` ON `tracks`(`file_path`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracks_artist` ON `tracks`(`artist`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracks_album` ON `tracks`(`album`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracks_is_favorite` ON `tracks`(`is_favorite`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_id` ON `playlist_tracks`(`playlist_id`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_track_id` ON `playlist_tracks`(`track_id`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_folders_path` ON `folders`(`path`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_radio_favorites_station_uuid` ON `radio_favorites`(`station_uuid`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_play_history_track_id` ON `play_history`(`track_id`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_play_history_played_at` ON `play_history`(`played_at`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_youtube_mappings_track_id` ON `youtube_mappings`(`track_id`)
