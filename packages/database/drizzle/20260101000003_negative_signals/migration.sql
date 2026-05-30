CREATE TABLE `negative_signals` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL UNIQUE,
	`artist` text,
	`source` text DEFAULT 'context-menu' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_negative_signals_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_negative_signals_track_id` ON `negative_signals`(`track_id`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_negative_signals_artist` ON `negative_signals`(`artist`)