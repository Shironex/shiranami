-- Repair art values that were written as loopback URLs (data fix, no DDL).
--
-- §2.4 rewrites a stored `shiranami-art://art/<hash>.jpg` onto the loopback
-- media server (`http://127.0.0.1:<port>/<token>/art/<hash>.jpg`) for display,
-- and that rewrite is one-directional by contract. Two renderer paths broke the
-- contract by round-tripping the rewritten value straight back into the
-- database — the enrich apply path through `db:tracks:update-many` and the
-- scan-and-persist path through `db:tracks:add-many` — so shipped rows now hold
-- an address made of a port and a session token that died with the process that
-- minted them. Two consequences, both already observed:
--
--   1. Every affected cover is `ECONNREFUSED` on the next launch.
--   2. `shiranami_metadata::art::prune_orphans` recognises only the
--      `shiranami-art://` form, so a database full of loopback URLs looked
--      *entirely unreferenced* and the boot prune deleted the whole cover
--      cache.
--
-- The write side is now sealed in `shiranami-db`'s `repo::art_url` and in the
-- renderer's `stream-urls.ts`; this migration repairs what was written before
-- they existed.
--
-- # Additive and idempotent, like every post-baseline migration
--
-- No schema change at all: two `UPDATE`s over two columns, both matching only
-- the loopback shape and both leaving the value they produce outside their own
-- `WHERE`. Running it twice changes nothing the second time, and a v1 build
-- rolling back reads `shiranami-art://` URLs — which is exactly what v1 wrote —
-- so the rollback window and the `user_version` floor are untouched.
--
-- # What is deliberately not matched
--
-- Remote `https://` covers and legacy `data:` URLs are legitimate values of
-- both columns (the prune's own tests pin that), so the match is anchored to a
-- loopback *origin* rather than to the `/art/` segment: a remote cover served
-- from a path containing `/art/` is a normal remote cover and stays one. The
-- server is plaintext HTTP and has never emitted an `https://` loopback URL, so
-- only the three `http://` authorities are listed; the Rust guard accepts the
-- TLS spellings as well, because refusing to write one costs nothing and
-- failing to repair one would cost a cover cache.
--
-- # Reading the expression
--
-- `rtrim(X, Y)` strips trailing characters *belonging to the set* Y. With Y as
-- the URL minus its slashes, that set is every non-slash character in the
-- value, so the rtrim eats the file name and stops at the final `/` — leaving
-- the prefix, which `replace` then removes to yield the last path component.
-- The two `CASE`s cut a fragment and then a query string off that component,
-- in that order so `x.jpg?v=2#frag` and `x.jpg#frag?v=2` both reduce to
-- `x.jpg`. A value whose last component is empty (a URL ending in `/`) names no
-- file and is left exactly as it was rather than being rewritten to a prefix
-- with nothing after it.

CREATE TEMPORARY TABLE `art_url_repair` AS
WITH `candidate` AS (
	SELECT
		'tracks' AS `source`,
		`id` AS `row_id`,
		replace(`album_art`, rtrim(`album_art`, replace(`album_art`, '/', '')), '') AS `tail`
	FROM `tracks`
	WHERE `album_art` LIKE 'http://127.0.0.1:%/art/%'
		OR `album_art` LIKE 'http://localhost:%/art/%'
		OR `album_art` LIKE 'http://[::1]:%/art/%'
	UNION ALL
	SELECT
		'playlists' AS `source`,
		`id` AS `row_id`,
		replace(`cover_art`, rtrim(`cover_art`, replace(`cover_art`, '/', '')), '') AS `tail`
	FROM `playlists`
	WHERE `cover_art` LIKE 'http://127.0.0.1:%/art/%'
		OR `cover_art` LIKE 'http://localhost:%/art/%'
		OR `cover_art` LIKE 'http://[::1]:%/art/%'
),
`unfragmented` AS (
	SELECT
		`source`,
		`row_id`,
		CASE
			WHEN instr(`tail`, '#') > 0 THEN substr(`tail`, 1, instr(`tail`, '#') - 1)
			ELSE `tail`
		END AS `tail`
	FROM `candidate`
)
SELECT
	`source`,
	`row_id`,
	CASE
		WHEN instr(`tail`, '?') > 0 THEN substr(`tail`, 1, instr(`tail`, '?') - 1)
		ELSE `tail`
	END AS `file_name`
FROM `unfragmented`;

UPDATE `tracks`
SET `album_art` = 'shiranami-art://art/' || (
	SELECT `file_name` FROM `art_url_repair`
	WHERE `source` = 'tracks' AND `row_id` = `tracks`.`id`
)
WHERE `id` IN (
	SELECT `row_id` FROM `art_url_repair`
	WHERE `source` = 'tracks' AND `file_name` <> ''
);

UPDATE `playlists`
SET `cover_art` = 'shiranami-art://art/' || (
	SELECT `file_name` FROM `art_url_repair`
	WHERE `source` = 'playlists' AND `row_id` = `playlists`.`id`
)
WHERE `id` IN (
	SELECT `row_id` FROM `art_url_repair`
	WHERE `source` = 'playlists' AND `file_name` <> ''
);

DROP TABLE `art_url_repair`;
