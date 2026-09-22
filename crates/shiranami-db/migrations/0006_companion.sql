-- The companion's persistent self (v2 companion feature, Phase 1 "ledger").
--
-- Additive, like every post-baseline migration: one new table, nothing
-- altered, which is what keeps the v1 rollback window open — a user who rolls
-- back opens a database whose `user_version` is still 8 and whose extra table
-- drizzle never queries.
--
-- Column notes, since several look like choices and are constraints:
--
--   1. A singleton row (`CHECK (id = 1)`): there is exactly one companion per
--      library. The check makes "a second pet" unstorable rather than merely
--      unwritten.
--   2. `xp` is an **accumulator**, never derived from `play_history` on read.
--      `play_history.track_id` is ON DELETE CASCADE (0001_baseline.sql), so
--      removing tracks silently deletes history rows — a derived level would
--      demote the pet for tidying a library. Instead the repository seeds `xp`
--      once from SUM(played_seconds) at hatch time (existing users' pets hatch
--      honoring their whole history) and accrues forward at record-play time.
--      The unit is honest listened seconds, as the session clock counts them.
--   3. `stage` is stored while level is not: evolutions are one-way events the
--      user witnessed, so the stored stage only ever ratchets up, even if the
--      xp→stage function or the xp itself would say lower. Level/stage-from-xp
--      is otherwise a pure function in `shiranami-core::companion`.
--   4. `species` is `'shio' | 'hotaru'` (docs/v2/companion/decision.md). A
--      preference, not a collection — switching costs nothing and keeps the
--      stage, so it is one column on the one row.
--   5. `accessories` as a JSON text array follows the `smart_playlists.rules`
--      precedent from the baseline (`rules text DEFAULT '[]'`).
--   6. `hatched_at` / `last_seen_at` are ISO-8601 text like every other
--      instant the renderer reads; `hatched_at` is NULL only in the vanishing
--      instant before the first read seeds the row.

CREATE TABLE IF NOT EXISTS `companion_state` (
	`id` INTEGER PRIMARY KEY CHECK (`id` = 1),
	`name` TEXT,
	`species` TEXT NOT NULL DEFAULT 'shio',
	`stage` INTEGER NOT NULL DEFAULT 0,
	`xp` REAL NOT NULL DEFAULT 0,
	`accessories` TEXT NOT NULL DEFAULT '[]',
	`hatched_at` TEXT,
	`last_seen_at` TEXT
);
