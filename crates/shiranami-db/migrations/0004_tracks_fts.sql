-- Full-text search over the library (feature wave, F6).
--
-- An external-content FTS5 table over the five text columns the renderer
-- searches, kept in sync by triggers. FTS5 is already compiled into the
-- bundled SQLite (research-rust §0.7: `libsqlite3-sys` builds with
-- `-DSQLITE_ENABLE_FTS5`), so this adds no dependency.
--
-- Adoption stamps only `0001_baseline.sql`, so this file runs for real on a
-- fresh install, on a database adopted from v1, and on an imported backup.
-- The `'rebuild'` at the end is what makes all three paths equivalent: the
-- triggers only cover writes made *after* this migration, and an adopted or
-- imported library arrives full. Rebuilding from the content table on every
-- path means the index is never trusted to have been maintained.
--
-- Rollback stays open (`user_version` floor stays 8): purely additive — the
-- virtual table, its shadow tables and the triggers are objects v1 never
-- queries. The triggers do *fire* under a rolled-back v1, which is safe
-- because v1's better-sqlite3 also compiles SQLite with FTS5 enabled, so an
-- insert from the old build maintains the index instead of erroring.
--
-- Shape notes, since each looks like a choice and is a constraint:
--
--   1. `content='tracks'` (external content) stores no copy of the text —
--      the index maps straight onto `tracks` rows via `rowid`, so the table
--      costs an index, not a second library.
--   2. `tokenize='unicode61 remove_diacritics 2'` folds accents both in the
--      index and in queries: typing "beyonce" finds "Beyoncé". `2` (rather
--      than `1`) also folds codepoints where the accent is part of the
--      character, which is what Polish input needs ("ł" → "l").
--   3. `prefix='2 3'` indexes 2- and 3-character prefixes so the as-you-type
--      case — every query is a prefix query — stays index-served while the
--      term is still short.
--   4. The UPDATE trigger lists the five indexed columns. A play-count bump
--      or a loudness write updates `tracks` far more often than a tag edit,
--      and neither should touch the index.
--   5. External-content deletes must present the *old* row values (FTS5
--      subtracts the exact tokens it added), which is why the delete halves
--      of the triggers bind `old.*`.

CREATE VIRTUAL TABLE IF NOT EXISTS `tracks_fts` USING fts5(
	`title`,
	`artist`,
	`album`,
	`album_artist`,
	`genre`,
	content='tracks',
	content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2',
	prefix='2 3'
);

CREATE TRIGGER IF NOT EXISTS `tracks_fts_after_insert` AFTER INSERT ON `tracks` BEGIN
	INSERT INTO `tracks_fts`(rowid, `title`, `artist`, `album`, `album_artist`, `genre`)
	VALUES (new.rowid, new.`title`, new.`artist`, new.`album`, new.`album_artist`, new.`genre`);
END;

CREATE TRIGGER IF NOT EXISTS `tracks_fts_after_delete` AFTER DELETE ON `tracks` BEGIN
	INSERT INTO `tracks_fts`(`tracks_fts`, rowid, `title`, `artist`, `album`, `album_artist`, `genre`)
	VALUES ('delete', old.rowid, old.`title`, old.`artist`, old.`album`, old.`album_artist`, old.`genre`);
END;

CREATE TRIGGER IF NOT EXISTS `tracks_fts_after_update` AFTER UPDATE OF `title`, `artist`, `album`, `album_artist`, `genre` ON `tracks` BEGIN
	INSERT INTO `tracks_fts`(`tracks_fts`, rowid, `title`, `artist`, `album`, `album_artist`, `genre`)
	VALUES ('delete', old.rowid, old.`title`, old.`artist`, old.`album`, old.`album_artist`, old.`genre`);
	INSERT INTO `tracks_fts`(rowid, `title`, `artist`, `album`, `album_artist`, `genre`)
	VALUES (new.rowid, new.`title`, new.`artist`, new.`album`, new.`album_artist`, new.`genre`);
END;

-- Populate from whatever the content table already holds — the adopted-v1 and
-- imported-backup paths arrive with a full library and no index entries.
INSERT INTO `tracks_fts`(`tracks_fts`) VALUES ('rebuild');
