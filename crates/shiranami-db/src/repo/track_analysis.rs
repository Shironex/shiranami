//! The analysis engine's persistence: the skip-test read and the measurement
//! writes, split out of [`tracks`](super::tracks) the same way the loudness
//! columns were (one file, one job). Callers keep addressing these as
//! `tracks::…` via the re-export there, so the split is invisible at call
//! sites.

use sqlx::{Connection, SqliteConnection};

use crate::error::Result;
use crate::repo::conn::failed;
use crate::repo::track_loudness::set_loudness_lufs;

/// What the analysis engine's skip test reads: the three persisted
/// measurements, in one row read.
///
/// `None` for the whole struct means "no such track", which the analysis batch
/// treats the same as unmeasured — a row it cannot find is a row it cannot
/// skip, mirroring [`loudness_lufs`](super::track_loudness::loudness_lufs)'s
/// reasoning one level up.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TrackAnalysisState {
    /// `tracks.loudness_lufs`.
    pub loudness_lufs: Option<f64>,
    /// `tracks.bpm`.
    pub bpm: Option<f64>,
    /// `tracks.musical_key`.
    pub musical_key: Option<String>,
}

/// Read a track's persisted analysis measurements.
pub async fn analysis_state(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<TrackAnalysisState>> {
    let found: Option<(Option<f64>, Option<f64>, Option<String>)> =
        sqlx::query_as("SELECT loudness_lufs, bpm, musical_key FROM tracks WHERE id = ?1")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(failed("read the track's analysis state"))?;

    Ok(
        found.map(|(loudness_lufs, bpm, musical_key)| TrackAnalysisState {
            loudness_lufs,
            bpm,
            musical_key,
        }),
    )
}

/// Record a track's estimated tempo and key in one statement.
///
/// Both columns written together because the engine measures them together;
/// a `None` clears nothing — it writes `NULL`, which is the honest "analysed,
/// nothing detectable" state. `updated_at` is deliberately untouched for the
/// same reason [`set_loudness_lufs`] leaves it: a backend measurement is not a
/// user edit.
pub async fn set_bpm_key(
    conn: &mut SqliteConnection,
    id: &str,
    bpm: Option<f64>,
    musical_key: Option<&str>,
) -> Result<()> {
    sqlx::query("UPDATE tracks SET bpm = ?1, musical_key = ?2 WHERE id = ?3")
        .bind(bpm)
        .bind(musical_key)
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("record the track's tempo and key"))?;

    Ok(())
}

/// One track's measurements from an analysis run, ready to persist.
///
/// A `None` field means "not measured this run — leave the column alone",
/// which is how a run that only filled gaps avoids clobbering values it never
/// recomputed. `bpm_key` is all-or-nothing because the engine estimates the
/// pair together (see [`set_bpm_key`]); its inner `None`s are real `NULL`s.
#[derive(Debug, Clone, PartialEq)]
pub struct AnalysisWrite {
    /// The row to update.
    pub id: String,
    /// A fresh loudness measurement, or `None` to leave the column untouched.
    pub loudness_lufs: Option<f64>,
    /// A fresh tempo/key estimate, or `None` to leave both columns untouched.
    pub bpm_key: Option<(Option<f64>, Option<String>)>,
}

/// Persist a batch of analysis measurements in one transaction.
///
/// The analysis engine decodes on every core at once but the pool holds a
/// single connection, so per-track write-through would serialise the whole run
/// on the database. Chunked batches through this function are the "parallel
/// analysis, serialized writes" half of that bargain: the caller accumulates
/// results while decodes continue, then pays one acquire and one commit per
/// chunk.
pub async fn record_analysis_many(
    conn: &mut SqliteConnection,
    writes: &[AnalysisWrite],
) -> Result<()> {
    if writes.is_empty() {
        return Ok(());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin recording the analysis batch"))?;

    for write in writes {
        if let Some(lufs) = write.loudness_lufs {
            set_loudness_lufs(&mut tx, &write.id, lufs).await?;
        }
        if let Some((bpm, musical_key)) = &write.bpm_key {
            set_bpm_key(&mut tx, &write.id, *bpm, musical_key.as_deref()).await?;
        }
    }

    tx.commit()
        .await
        .map_err(failed("record the analysis batch"))?;

    Ok(())
}
