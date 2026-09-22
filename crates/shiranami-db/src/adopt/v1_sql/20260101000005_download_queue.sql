CREATE TABLE `download_queue` (
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
)
