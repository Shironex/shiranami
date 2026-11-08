-- LAN sync v0: the phones this desktop has paired with, and the desktop's own
-- sync identity (docs/research/mobile-2026-11/lan-sync.md, section 3).
--
-- Additive, like every post-baseline migration: two new tables, nothing
-- altered, so the `user_version` floor stays 8 and a rolled-back build simply
-- never reads them.
--
-- `sync_peers.secret` is the per-device HMAC key, base64url. It has to be
-- stored, not hashed, because the desktop recomputes every request signature
-- with it. That makes this table a credential: `db:backup:export` deletes its
-- rows from the exported copy (`repo::sync::strip_credentials`), so a shared
-- backup is never a sync key. Revoking a device deletes its row, and the next
-- request signed with the old key gets a 404.
--
-- `sync_meta` is a small key/value table for the desktop's own ids
-- (`desktop_id`, `library_id`), minted on first use and stable across restarts
-- so a paired phone recognises the same desktop and library.

CREATE TABLE IF NOT EXISTS `sync_peers` (
	`device_id` text PRIMARY KEY,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`secret` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text
);

CREATE TABLE IF NOT EXISTS `sync_meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
