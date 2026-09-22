//! Reading a `tracks` row into [`Track`].
//!
//! Its own module because three namespaces return track rows — `db:tracks:*`,
//! `db:playlists:get-tracks` and both smart-playlist evaluation channels — and
//! the mapping has to be identical in all three or the renderer sees a
//! `Track` whose shape depends on which screen loaded it.
//!
//! [`Track`] cannot derive `sqlx::FromRow`: it lives in `shiranami-core`, which
//! sits below `sqlx` on the dependency spine and must not learn about it, and
//! the orphan rule stops this crate from implementing a foreign trait for a
//! foreign type. The mapping is therefore written out, by column name, which
//! also makes it robust against column *order* — a healed legacy database
//! carries `disc_number` last rather than mid-table (architecture, Phase 6
//! amendments).

use shiranami_core::models::Track;
use sqlx::{Row, sqlite::SqliteRow};

use crate::error::Result;
use crate::repo::conn::failed;

/// The `SELECT` list for every query that returns whole tracks.
///
/// `tracks.*` rather than a spelled-out column list so that a future migration
/// adding a column does not silently return `NULL`s through a stale list, and
/// qualified rather than bare so the same text works inside the
/// `playlist_tracks` join. Only ever concatenated with other `&'static str`s —
/// no value reaches it.
pub(crate) const TRACK_SELECT: &str = "SELECT tracks.* FROM tracks";

/// `ORDER BY` for every library-wide read.
///
/// v1's `LIBRARY_TIE_BREAK`, verbatim. `created_at` defaults to
/// `datetime('now')` — one-second resolution — so a folder scan stamps a whole
/// import with the same value, and without the second key the order inside that
/// run is whatever the planner produces, which changes when an index is added.
/// `rowid` ascending is insertion order, which is what users have always seen.
pub(crate) const LIBRARY_ORDER: &str = " ORDER BY tracks.created_at DESC, tracks.rowid ASC";

/// Map one row of `tracks.*` into the wire model.
pub(crate) fn track(row: &SqliteRow) -> Result<Track> {
    read(row).map_err(failed("read a track row"))
}

/// Map every row, stopping at the first that will not decode.
pub(crate) fn tracks(rows: &[SqliteRow]) -> Result<Vec<Track>> {
    rows.iter().map(track).collect()
}

/// The column-by-column mapping, kept separate so the error is named once.
///
/// Nullability mirrors the drizzle schema exactly. `is_favorite` and
/// `play_count` are `Option` because the columns are nullable *despite* their
/// defaults: `NOT is_favorite` over a `NULL` is `NULL`, so a row can hold one.
fn read(row: &SqliteRow) -> sqlx::Result<Track> {
    Ok(Track {
        id: row.try_get("id")?,
        file_path: row.try_get("file_path")?,
        title: row.try_get("title")?,
        artist: row.try_get("artist")?,
        album_artist: row.try_get("album_artist")?,
        album: row.try_get("album")?,
        duration: row.try_get("duration")?,
        genre: row.try_get("genre")?,
        year: row.try_get("year")?,
        track_number: row.try_get("track_number")?,
        disc_number: row.try_get("disc_number")?,
        album_art: row.try_get("album_art")?,
        loudness_lufs: row.try_get("loudness_lufs")?,
        bpm: row.try_get("bpm")?,
        musical_key: row.try_get("musical_key")?,
        is_favorite: row.try_get("is_favorite")?,
        play_count: row.try_get("play_count")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        album_loudness_lufs: row.try_get("album_loudness_lufs")?,
        true_peak_db: row.try_get("true_peak_db")?,
        loudness_range: row.try_get("loudness_range")?,
    })
}
