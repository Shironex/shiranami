CREATE INDEX IF NOT EXISTS `idx_tracks_created_at` ON `tracks`(`created_at`)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_position` ON `playlist_tracks`(`playlist_id`,`position`)
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_playlist_tracks_playlist_id`
