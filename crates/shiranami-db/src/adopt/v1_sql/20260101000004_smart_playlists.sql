CREATE TABLE `smart_playlists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`match_type` text DEFAULT 'all' NOT NULL,
	`rules` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
)
