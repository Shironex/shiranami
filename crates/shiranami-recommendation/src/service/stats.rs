//! Folding the three dislike-aware reads into the scoring core's input shapes.

use shiranami_db::Result;
use shiranami_db::repo::recommendations as repo;
use sqlx::SqliteConnection;

use crate::core::{MixTrack, TrackStats};

/// Every played track as the affinity ranker wants it.
///
/// Three queries and a fold, exactly as v1's `getLibraryStats()` was — see
/// `shiranami_db::repo::recommendations` for why the obvious single-query
/// version is not equivalent.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if any of the three reads fails.
pub async fn library_stats(conn: &mut SqliteConnection) -> Result<Vec<TrackStats>> {
    let rows = repo::play_stats(&mut *conn).await?;
    let disliked = repo::disliked_track_ids(&mut *conn).await?;
    let artist_dislikes = repo::artist_dislike_counts(&mut *conn).await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            // `NULL` becomes the empty string, not `UNKNOWN_ARTIST`. v1 did the
            // same, and the scoring core reads `""` as "no usable tag" — the
            // sentinel would instead be a tag that every untagged track shares.
            let artist = row.artist.unwrap_or_default();
            let album = row.album.unwrap_or_default();
            let is_disliked = disliked.contains(&row.track_id);

            TrackStats {
                plays: u32::try_from(row.plays).unwrap_or(u32::MAX),
                avg_completion: row.avg_completion,
                last_played_at: row.last_played_at,
                is_favorite: row.is_favorite,
                is_disliked,
                artist_dislikes: artist_dislikes_for(&artist, &artist_dislikes, is_disliked),
                track_id: row.track_id,
                title: row.title,
                artist,
                album,
            }
        })
        .collect())
}

/// Marks against *other* tracks by this artist.
///
/// v1's `Math.max(0, (artist ? counts.get(artist) ?? 0 : 0) - (disliked ? 1 : 0))`,
/// and all three parts of it are load-bearing:
///
/// - An **untagged** artist scores 0 rather than looking the empty string up,
///   because `artist ? … : 0` treated `""` as absent. Without it every untagged
///   dislike would penalise every other untagged track.
/// - The **self-subtraction** is what makes this "other tracks": a track the
///   user disliked directly contributed one mark to its own artist's count, and
///   leaving it in would penalise the artist twice for one signal.
/// - The **clamp** guards a count that has gone negative, which the subtraction
///   can only produce if the two reads disagree — possible between them, since
///   they are separate statements.
fn artist_dislikes_for(
    artist: &str,
    counts: &std::collections::HashMap<String, i64>,
    is_disliked: bool,
) -> i64 {
    if artist.is_empty() {
        return 0;
    }
    let marks = counts.get(artist).copied().unwrap_or(0);
    (marks - i64::from(is_disliked)).max(0)
}

/// Every track in the library, as the mix generator wants it.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if the read fails.
pub async fn mix_tracks(conn: &mut SqliteConnection) -> Result<Vec<MixTrack>> {
    let rows = repo::mix_tracks(conn).await?;

    Ok(rows
        .into_iter()
        .map(|row| MixTrack {
            track_id: row.track_id,
            genre: row.genre,
            // A year outside `i32` is corrupt tag data, and the decade bucketer
            // already discards anything below 1000; dropping it to `None` here
            // is the same shelf either way and keeps the conversion total.
            year: row.year.and_then(|year| i32::try_from(year).ok()),
            // v1's `Number(playCount ?? 0)`. A negative count cannot come from
            // the increment path, so it degrades to 0 rather than wrapping.
            play_count: row
                .play_count
                .map_or(0, |count| u32::try_from(count).unwrap_or(0)),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn counts(pairs: &[(&str, i64)]) -> HashMap<String, i64> {
        pairs
            .iter()
            .map(|(artist, marks)| ((*artist).to_owned(), *marks))
            .collect()
    }

    #[test]
    fn an_untagged_artist_never_carries_artist_level_dislikes() {
        assert_eq!(artist_dislikes_for("", &counts(&[("", 5)]), false), 0);
    }

    /// The signal is "the user disliked this artist's *other* work", so a track
    /// that is itself disliked must not also be penalised for the mark it
    /// contributed.
    #[test]
    fn a_disliked_track_does_not_count_its_own_mark_against_its_artist() {
        let counts = counts(&[("Aoi", 3)]);

        assert_eq!(artist_dislikes_for("Aoi", &counts, true), 2);
        assert_eq!(artist_dislikes_for("Aoi", &counts, false), 3);
    }

    #[test]
    fn an_artist_with_no_marks_scores_zero_rather_than_going_negative() {
        assert_eq!(artist_dislikes_for("Aoi", &counts(&[]), true), 0);
    }
}
