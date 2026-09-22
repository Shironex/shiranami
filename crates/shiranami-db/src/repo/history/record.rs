//! Recording a finished play — the one write in this repository.

use shiranami_core::models::{PlayHistoryRecord, RecordPlayInput};
use sqlx::{Connection, SqliteConnection};

use super::rows::{PlayHistoryRow, PlayedTrackTagsRow};
use crate::error::{DbError, Result};

/// A play counts as complete at this fraction of a known track length.
const COMPLETION_THRESHOLD: f64 = 0.95;

/// Playback origin assumed when the renderer sends none.
const DEFAULT_SOURCE: &str = "library";

/// The track tags [`record_play`] reads back for the scrobbler.
///
/// Not a wire type and deliberately not in `shiranami-core`: the renderer never
/// sees it. v1 returned it from the same transaction as the insert so that
/// submitting a scrobble did not cost a second round-trip, and this preserves
/// that.
#[derive(Debug, Clone, PartialEq)]
pub struct PlayedTrackTags {
    /// Track title.
    pub title: String,
    /// Track artist, raw — `None` when the column is `NULL`. Uncollapsed on
    /// purpose: a scrobble tagged "Unknown Artist" is worse than no scrobble,
    /// and the caller decides.
    pub artist: Option<String>,
    /// Track album, raw.
    pub album: Option<String>,
    /// Track length in seconds, as tagged.
    pub duration: Option<f64>,
}

/// What [`record_play`] committed.
#[derive(Debug, Clone, PartialEq)]
pub struct RecordedPlay {
    /// The inserted `play_history` row — the value the channel returns.
    pub entry: PlayHistoryRecord,
    /// Tags of the track whose `play_count` was bumped.
    ///
    /// `None` only if the `UPDATE` matched nothing, which the foreign key on
    /// `play_history.track_id` makes unreachable: the insert above it would
    /// have failed first. Kept optional because v1 checked it too, and because
    /// a future migration that drops the constraint should not become a panic.
    pub track: Option<PlayedTrackTags>,
}

/// Record one finished play and bump the track's lifetime play count.
///
/// `id` is the new row's primary key and `now` the ISO-8601 timestamp for both
/// `played_at` and the track's `updated_at` — see [`super`] for why they are
/// arguments and why the format matters. v1 called `new Date()` twice,
/// microseconds apart; one value for both is the same thing said once.
///
/// The two statements share a transaction, as they did in v1: a play that is
/// counted in the history but not in `tracks.play_count` (or the reverse) is a
/// permanent inconsistency in data nothing ever recomputes.
///
/// # Errors
///
/// Returns [`DbError::Query`] if either statement fails — including the foreign
/// key violation raised when `track_id` names no track.
pub async fn record_play(
    conn: &mut SqliteConnection,
    id: &str,
    now: &str,
    input: &RecordPlayInput,
) -> Result<RecordedPlay> {
    // v1's arithmetic, branch for branch. `duration` is nullable and may be
    // zero or negative from a malformed tag, so the ratio guards on `> 0` while
    // `completed` guards only on "present and non-zero" — matching JavaScript
    // truthiness, under which a negative duration is truthy and yields a ratio
    // of 0, hence `completed == false`.
    let played_seconds = input.played_seconds.max(0.0);
    let completion_ratio = match input.duration {
        Some(duration) if duration > 0.0 => (played_seconds / duration).min(1.0),
        _ => 0.0,
    };
    let completed = match input.duration {
        Some(duration) if duration != 0.0 => completion_ratio >= COMPLETION_THRESHOLD,
        _ => false,
    };
    let source = input.source.as_deref().unwrap_or(DEFAULT_SOURCE);

    let mut tx = conn.begin().await.map_err(|source| DbError::Query {
        operation: "begin the record-play transaction",
        source,
    })?;

    let entry = sqlx::query_as::<_, PlayHistoryRow>(
        "INSERT INTO play_history \
           (id, track_id, played_at, played_seconds, completion_ratio, completed, source) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         RETURNING id, track_id, played_at, played_seconds, completion_ratio, completed, source",
    )
    .bind(id)
    .bind(&input.track_id)
    .bind(now)
    .bind(played_seconds)
    .bind(completion_ratio)
    .bind(completed)
    .bind(source)
    .fetch_one(&mut *tx)
    .await
    .map_err(|source| DbError::Query {
        operation: "record the play in the listening history",
        source,
    })?;

    // `COALESCE` because `play_count` is nullable with a default of 0 — a row
    // written before that default existed can still hold NULL, and `NULL + 1`
    // is NULL, which would quietly un-count every future play of that track.
    let track = sqlx::query_as::<_, PlayedTrackTagsRow>(
        "UPDATE tracks \
            SET play_count = COALESCE(play_count, 0) + 1, updated_at = ?1 \
          WHERE id = ?2 \
         RETURNING title, artist, album, duration",
    )
    .bind(now)
    .bind(&input.track_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|source| DbError::Query {
        operation: "increment the track's play count",
        source,
    })?;

    tx.commit().await.map_err(|source| DbError::Query {
        operation: "commit the record-play transaction",
        source,
    })?;

    Ok(RecordedPlay {
        entry: entry.into(),
        track: track.map(Into::into),
    })
}
