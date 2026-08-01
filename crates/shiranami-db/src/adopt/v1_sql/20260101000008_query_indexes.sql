CREATE INDEX IF NOT EXISTS `idx_playlist_tracks_playlist_position` ON `playlist_tracks`(`playlist_id`,`position`)
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_playlist_tracks_playlist_id`
