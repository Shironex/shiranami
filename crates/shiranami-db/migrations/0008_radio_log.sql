-- The radio diary: what each station said it was playing.
--
-- The stream proxy de-frames ICY `StreamTitle` metadata and reports each
-- *change* (`shiranami_serve::icy`). Until now that title existed only for as
-- long as it was on screen, so "what was that song?" had no answer thirty
-- seconds later. This table is the answer: one row per distinct title, kept
-- locally, read back by the station's diary panel.
--
-- Additive, like every post-baseline migration: one new table and its index,
-- nothing altered, which is what keeps the v1 rollback window open — a user who
-- rolls back opens a database whose `user_version` is still 8 and whose extra
-- table drizzle never queries.
--
-- Column notes, since several look like choices and are constraints:
--
--   1. `id` is an `INTEGER PRIMARY KEY` — a rowid alias — where every other v2
--      table this migration's neighbours added mints a text UUID. Two reasons.
--      Nothing references a log row, so the id needs no meaning outside this
--      table; and the only ordering key here is time, which at millisecond
--      resolution ties whenever a station sends two titles inside the same
--      millisecond. A rowid is monotonic by construction, so it breaks that tie
--      the way insertion order actually happened. A v4 UUID would break it
--      arbitrarily.
--   2. `raw_title` is the `StreamTitle` **exactly as it decoded**, and it is
--      NOT NULL because it is the only field the feature cannot work without.
--      Stations broadcast idents, sponsor reads and tickers through the same
--      field as songs; none of those are malformed and none are filtered.
--   3. `artist` / `title` are the best-effort split on the ` - ` convention
--      (`shiranami_core::models::RadioNowPlaying`), and are NULL whenever the
--      string does not carry it — which is often. They are a convenience for
--      display and search; `raw_title` is the source of truth, so a row whose
--      split looks wrong is still a row the user can read and act on.
--   4. `heard_at` is ISO-8601 text (`2026-08-01T12:34:56.789Z`), the spelling
--      `play_history` uses, written from SQLite's own clock. This table is
--      v2-born, so unlike `radio_favorites` it inherits no `datetime('now')`
--      rows to sort against and can use the format the renderer reads directly.
--
-- # The station is identified by its directory UUID
--
-- `station_uuid` is the Radio Browser id — the same value `radio_favorites`
-- keys on and the same one the renderer holds while browsing. Deliberately not
-- a foreign key onto `radio_favorites`: the diary records what a station played
-- whether or not the user ever saved it, and saving a station later must not
-- retroactively change what is already logged. There is no `ON DELETE` to
-- reason about because there is nothing to delete from.
--
-- # The table is bounded, and the bound is enforced on write
--
-- A station left playing overnight is the ordinary case, not the pathological
-- one, and some stations re-title every few seconds for ad breaks and traffic
-- tickers. So `repo::radio_log::record` trims to `MAX_ROWS` (5 000) newest rows
-- on every insert — see that module for the arithmetic. The cap is global
-- rather than per-station on purpose: the thing that must stay bounded is the
-- file on the user's disk, and a per-station cap bounds nothing when the user
-- keeps finding new stations.

CREATE TABLE IF NOT EXISTS `radio_log` (
	`id` INTEGER PRIMARY KEY,
	`station_uuid` TEXT NOT NULL,
	`raw_title` TEXT NOT NULL,
	`artist` TEXT,
	`title` TEXT,
	`heard_at` TEXT NOT NULL
);

-- The diary panel reads one station's rows newest-first, which is this index
-- exactly. The trim does not use it and does not want to: it orders by `id`,
-- so it walks the table's own rowid order and needs no ordering structure at
-- all. This index is leading-column `station_uuid`, so a *global* ordering
-- could not have used it for ordering anyway — `EXPLAIN QUERY PLAN` on a
-- `heard_at`-ordered trim shows a covering scan plus a temp b-tree.
CREATE INDEX IF NOT EXISTS `idx_radio_log_station_heard` ON `radio_log`(`station_uuid`, `heard_at` DESC);
