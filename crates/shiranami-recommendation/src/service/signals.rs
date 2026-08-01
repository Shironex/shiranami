//! "Not interested", and undoing it.

use shiranami_core::models::RecommendationKind;
use shiranami_db::Result;
use shiranami_db::repo::recommendations as repo;
use sqlx::SqliteConnection;

/// Where a "not interested" mark came from. v1's only caller passed nothing and
/// took the column default, so this is that default spelled out.
pub const DEFAULT_SOURCE: &str = "context-menu";

/// Mark a track "not interested".
///
/// `id` is the new row's primary key, minted by the caller — the same
/// convention `shiranami_db::repo` uses everywhere a row needs one, so the one
/// source of randomness stays in the composition root.
///
/// **A missing track is a silent no-op**, as it was in v1: the renderer fires
/// this from a context menu that can outlive the row it was opened on, and
/// there is nothing a user could do about "that track is gone" except be
/// interrupted by it. The distinction the repository preserves — no such track
/// versus a track with no artist tag — is what makes that reachable here
/// without a second query.
///
/// The artist is denormalised into the signal row at write time so the
/// artist-level penalty survives the track being retagged or deleted, which is
/// exactly when the user most wants it to.
///
/// # The cache invalidation is the point
///
/// Dropping the cached **library** shelf is what makes the mark visible: the
/// next read finds no row, recomputes, and the disliked track is gone from the
/// shelf. Without it the user would mark a track and watch it sit there for up
/// to a day.
///
/// The **discover** shelf is deliberately left alone. Recomputing it spawns
/// yt-dlp, and v1 scoped the invalidation the same way for the same reason.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if any statement fails.
pub async fn mark_not_interested(
    conn: &mut SqliteConnection,
    id: &str,
    track_id: &str,
) -> Result<()> {
    let Some(artist) = repo::track_artist(&mut *conn, track_id).await? else {
        tracing::warn!(
            track_id,
            "not-interested ignored; the track is not in the library"
        );
        return Ok(());
    };

    repo::add_negative_signal(&mut *conn, id, track_id, artist.as_deref(), DEFAULT_SOURCE).await?;

    invalidate_library(&mut *conn).await
}

/// Undo a "not interested" mark.
///
/// Unconditional, and undoing one that was never made is not an error — v1
/// issued the same bare `DELETE`. It carries no existence check on purpose: the
/// undo is offered from a toast that can outlive the row, and the two failure
/// modes it could report are both "the track is already not marked".
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if either statement fails.
pub async fn undo_not_interested(conn: &mut SqliteConnection, track_id: &str) -> Result<()> {
    repo::remove_negative_signal(&mut *conn, track_id).await?;

    invalidate_library(&mut *conn).await
}

/// Drop the cached library shelf so the next read recomputes it.
async fn invalidate_library(conn: &mut SqliteConnection) -> Result<()> {
    repo::delete_shelf(conn, super::shelves::kind_key(RecommendationKind::Library)).await
}
