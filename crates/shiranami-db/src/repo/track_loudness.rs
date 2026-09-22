//! The `tracks` loudness columns — v1's single value and F5's profile.
//!
//! Its own module beside [`super::tracks`] for the same reason `track_row` and
//! `track_patch` are: the tracks namespace outgrew one file, and loudness is
//! one job. Everything here is re-exported through `repo::tracks`, so callers
//! keep saying `tracks::loudness_lufs` — the split is module shape, not API.
//!
//! Two properties govern every write in this file:
//!
//! - **Continuity.** `loudness_lufs` values measured by v1 are carried across
//!   and never overwritten (`shiranami-audio`'s contract); the F5 columns are
//!   v2-only and always take the fresh measurement.
//! - **A measurement is not an edit.** No write here touches `updated_at` —
//!   an analysis run must not read as a library-wide modification.

use sqlx::{QueryBuilder, Row as _, Sqlite, SqliteConnection};

use crate::error::Result;
use crate::repo::conn::failed;

/// Ids per `IN (…)` list, as [`super::tracks`] sizes its own. An album is tens
/// of tracks, so one chunk is the overwhelmingly common case.
const ID_CHUNK: usize = 500;

/// The track's measured integrated loudness, or `None` when it has none.
///
/// `None` deliberately folds together "no such track" and "the column is
/// `NULL`", because its one caller — `loudness:analyze` — treats both the same
/// way: a track it cannot find and a track never measured are both tracks to
/// measure. v1 read the same single column for the same skip test
/// (`loudness.ts:96-101`) rather than loading the row.
pub async fn loudness_lufs(conn: &mut SqliteConnection, id: &str) -> Result<Option<f64>> {
    let found: Option<Option<f64>> =
        sqlx::query_scalar("SELECT loudness_lufs FROM tracks WHERE id = ?1")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(failed("read the track's measured loudness"))?;

    Ok(found.flatten())
}

/// Record a track's measured integrated loudness, in LUFS.
///
/// The only column written, exactly as v1 wrote it
/// (`db.update(tracks).set({ loudnessLufs })`).
pub async fn set_loudness_lufs(conn: &mut SqliteConnection, id: &str, lufs: f64) -> Result<()> {
    sqlx::query("UPDATE tracks SET loudness_lufs = ?1 WHERE id = ?2")
        .bind(lufs)
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("record the track's measured loudness"))?;

    Ok(())
}

/// What the loudness pipeline already knows about a track (feature wave F5).
///
/// The three columns the analysis run's skip test reads together — one query
/// instead of three, taken while the connection is briefly held.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StoredLoudness {
    /// `tracks.loudness_lufs`.
    pub lufs: Option<f64>,
    /// `tracks.true_peak_db`.
    pub true_peak_db: Option<f64>,
    /// `tracks.album_loudness_lufs`.
    pub album_loudness_lufs: Option<f64>,
}

/// A track's stored loudness state, or `None` for an unknown id.
///
/// The caller treats an unknown track and an unmeasured one the same way —
/// both are "measure it" — the same collapse [`loudness_lufs`] makes.
pub async fn loudness_state(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<StoredLoudness>> {
    let row = sqlx::query(
        "SELECT loudness_lufs, true_peak_db, album_loudness_lufs FROM tracks WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(failed("read the track's loudness state"))?;

    let Some(row) = row else { return Ok(None) };
    let read = || -> sqlx::Result<StoredLoudness> {
        Ok(StoredLoudness {
            lufs: row.try_get("loudness_lufs")?,
            true_peak_db: row.try_get("true_peak_db")?,
            album_loudness_lufs: row.try_get("album_loudness_lufs")?,
        })
    };

    read()
        .map(Some)
        .map_err(failed("read the track's loudness state"))
}

/// One measured loudness profile, as [`set_loudness_profile`] persists it.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct LoudnessProfileUpdate {
    /// Integrated loudness, in LUFS. Only lands where the column is still
    /// `NULL` — rows measured by v1 are carried across and never overwritten.
    pub lufs: Option<f64>,
    /// True peak, in dBTP. `None` (silence) stores `NULL`.
    pub true_peak_db: Option<f64>,
    /// Loudness range, in LU.
    pub loudness_range: Option<f64>,
}

/// Record a track's measured loudness profile.
///
/// `COALESCE` keeps an existing integrated value: the continuity contract says
/// a v1 measurement is never re-written, while the two v2-only columns are
/// always the fresh measurement.
pub async fn set_loudness_profile(
    conn: &mut SqliteConnection,
    id: &str,
    profile: &LoudnessProfileUpdate,
) -> Result<()> {
    sqlx::query(
        "UPDATE tracks SET \
            loudness_lufs = COALESCE(loudness_lufs, ?1), \
            true_peak_db = ?2, \
            loudness_range = ?3 \
         WHERE id = ?4",
    )
    .bind(profile.lufs)
    .bind(profile.true_peak_db)
    .bind(profile.loudness_range)
    .bind(id)
    .execute(&mut *conn)
    .await
    .map_err(failed("record the track's loudness profile"))?;

    Ok(())
}

/// Stamp one album's measured loudness onto its member rows.
///
/// One value, many ids — the album fold produces a single LUFS for the whole
/// record. Chunked like every other `IN (…)` in the tracks namespace.
pub async fn set_album_loudness(
    conn: &mut SqliteConnection,
    ids: &[String],
    album_lufs: f64,
) -> Result<()> {
    for chunk in ids.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new("UPDATE tracks SET album_loudness_lufs = ");
        builder.push_bind(album_lufs);
        builder.push(" WHERE id IN (");

        let mut list = builder.separated(", ");
        for id in chunk {
            list.push_bind(id.clone());
        }
        builder.push(")");

        builder
            .build()
            .execute(&mut *conn)
            .await
            .map_err(failed("record the album's measured loudness"))?;
    }

    Ok(())
}
