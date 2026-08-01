-- The scrobble retry queue.
--
-- v2's first post-baseline migration (architecture §3.2: "from `0002_*.sql`
-- onward, migrations are pure sqlx and drizzle is dead"), and the upgrade
-- Phase 12 owes the scrobbler: v1 parked failed submissions in a process-memory
-- array, so quitting the app threw away every play that had not landed yet.
--
-- Adoption stamps only `0001_baseline.sql`, so this file *runs for real* on both
-- a fresh install and a database adopted from v1. That is why it is purely
-- additive — a new table and its index, nothing altered — which is also what
-- keeps it `backwardCompatible` in the sense §3.2 freezes for the handover
-- window: a user who rolls back to v1 opens a database whose `user_version` is
-- still 8 and whose extra table v1 simply never queries.
--
-- Column notes, since three of them look like choices and are constraints:
--
--   1. `started_at` is unix **seconds** — it is the timestamp submitted to
--      Last.fm and ListenBrainz, and both APIs take seconds. `next_attempt_at`
--      and `enqueued_at` are unix **milliseconds**, because they are compared
--      against the local clock and v1 compared them against `Date.now()`.
--   2. The remaining targets are two flags rather than a list column or a child
--      table. `ScrobbleTarget` is a closed two-variant set, and flags make "a
--      parked scrobble owes at least one backend" a CHECK the database
--      enforces — which is exactly v1's `remainingTargets.length === 0 → drop`
--      rule, expressed once, where it cannot be forgotten.
--   3. `enqueued_at` exists only to order eviction. v1 evicted by array
--      position when the queue passed its cap; an array position has no column,
--      so the enqueue instant stands in for it, with `id` breaking ties.

CREATE TABLE IF NOT EXISTS `scrobble_queue` (
	`id` text PRIMARY KEY,
	`artist` text NOT NULL,
	`track` text NOT NULL,
	`album` text,
	`duration_seconds` integer,
	`started_at` integer NOT NULL,
	`lastfm_pending` integer NOT NULL,
	`listenbrainz_pending` integer NOT NULL,
	`attempts` integer NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`enqueued_at` integer NOT NULL,
	CHECK (`lastfm_pending` IN (0, 1)),
	CHECK (`listenbrainz_pending` IN (0, 1)),
	CHECK (`lastfm_pending` + `listenbrainz_pending` > 0)
);

-- The flush picks due items oldest-play-first, which is this index exactly.
CREATE INDEX IF NOT EXISTS `idx_scrobble_queue_due` ON `scrobble_queue`(`next_attempt_at`, `started_at`);
