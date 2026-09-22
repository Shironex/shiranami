/**
 * Sentinel values the scanner writes into the `artist` / `album` columns when a
 * file carries no usable tag. They are English literals (the database stores no
 * i18n), used across the backend as both the write-time default and the
 * comparison value for "this track has no real artist/album". The renderer
 * substitutes a localized display string at the mapper boundary, so these
 * literals must never be shown directly in the UI — only compared against.
 *
 * v1's drizzle schema defaults and the already-shipped migration SQL (vendored
 * in crates/shiranami-db/src/adopt/v1_sql) embed these exact strings; changing the literal
 * here would diverge from on-disk databases, so treat the value as frozen.
 */
export const UNKNOWN_ARTIST = 'Unknown Artist';
export const UNKNOWN_ALBUM = 'Unknown Album';
