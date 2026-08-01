ALTER TABLE `tracks` ADD `album_artist` text
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracks_album_artist` ON `tracks`(`album_artist`)
