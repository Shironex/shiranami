//! "More like this": the prefilter that decides what gets scored, and the
//! ranking that scores it.

use shiranami_core::constants::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_core::models::{SIMILAR_TRACKS_MAX, SimilarTrackResult};
use shiranami_db::Result;
use shiranami_db::repo::recommendations as repo;
use sqlx::SqliteConnection;

use crate::core::{SimilarityTrack, SimilarityWeights, rank_by_similarity};

/// Tracks similar to `seed_track_id`, most similar first, capped at
/// [`SIMILAR_TRACKS_MAX`].
///
/// An empty list is returned — never an error — when the seed has left the
/// library, as v1 did: the renderer can ask for "more like this" on a track
/// that was removed under it, and that is an empty shelf rather than a toast.
///
/// # The candidate pool is a prefilter, and the sentinel guards are part of it
///
/// Only three things can score above zero: the same artist, the same album, or
/// co-membership in one of the seed's playlists. The query asks for exactly
/// that union, so a library of fifty thousand tracks is not read to rank the
/// four that match.
///
/// The two axes are passed only when the seed's tag is **real** — present and
/// not the scanner's missing-tag sentinel. That is not an optimisation: the
/// scoring core applies the same guard (`is_real_artist`), so passing an
/// untagged seed's `"Unknown Artist"` down would fetch every untagged track in
/// the library and then score every one of them zero. [`matchable`] is that
/// guard, and the test below pins the two to the same answer.
///
/// # Errors
///
/// Returns [`shiranami_db::DbError`] if any of the four reads fails.
pub async fn similar_tracks(
    conn: &mut SqliteConnection,
    seed_track_id: &str,
) -> Result<Vec<SimilarTrackResult>> {
    let Some(row) = repo::similarity_seed(&mut *conn, seed_track_id).await? else {
        tracing::info!(
            track_id = seed_track_id,
            "similar: the seed is not in the library"
        );
        return Ok(Vec::new());
    };

    let seed = SimilarityTrack {
        track_id: row.track_id,
        artist: row.artist.unwrap_or_default(),
        album: row.album.unwrap_or_default(),
    };

    let shared = repo::shared_playlist_counts(&mut *conn, seed_track_id).await?;

    // Sorted so the query text is stable across runs for a given library. The
    // *ranking* does not depend on it — equal-similarity ties keep the order
    // SQLite returns rows in, which had no `ORDER BY` in v1 either.
    let mut co_member_ids: Vec<String> = shared.keys().cloned().collect();
    co_member_ids.sort();

    let candidates = repo::similarity_candidates(
        &mut *conn,
        seed_track_id,
        matchable(&seed.artist, UNKNOWN_ARTIST),
        matchable(&seed.album, UNKNOWN_ALBUM),
        &co_member_ids,
    )
    .await?;

    let candidates: Vec<SimilarityTrack> = candidates
        .into_iter()
        .map(|row| SimilarityTrack {
            track_id: row.track_id,
            artist: row.artist.unwrap_or_default(),
            album: row.album.unwrap_or_default(),
        })
        .collect();

    let mut ranked = rank_by_similarity(&seed, &candidates, &shared, &SimilarityWeights::default());
    ranked.truncate(SIMILAR_TRACKS_MAX);

    Ok(ranked
        .into_iter()
        .map(|track| SimilarTrackResult {
            track_id: track.track_id,
            similarity: track.similarity,
        })
        .collect())
}

/// The tag, if it is one worth matching on.
///
/// Mirrors the scoring core's private `is_real_artist` / `is_real_album`. The
/// two live apart because one gates a SQL prefilter and the other gates a
/// score, and the core's is deliberately not public — its surface is a port
/// contract. They must agree, and
/// [`the_prefilter_and_the_scorer_agree_on_what_a_real_tag_is`] is what makes
/// that a test rather than a hope.
///
/// [`the_prefilter_and_the_scorer_agree_on_what_a_real_tag_is`]:
///     tests::the_prefilter_and_the_scorer_agree_on_what_a_real_tag_is
fn matchable<'tag>(tag: &'tag str, sentinel: &str) -> Option<&'tag str> {
    if tag.is_empty() || tag == sentinel {
        return None;
    }
    Some(tag)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::similarity_score;

    #[test]
    fn a_present_tag_is_matchable() {
        assert_eq!(matchable("Aoi", UNKNOWN_ARTIST), Some("Aoi"));
    }

    #[test]
    fn an_absent_or_sentinel_tag_is_not() {
        assert_eq!(matchable("", UNKNOWN_ARTIST), None);
        assert_eq!(matchable(UNKNOWN_ARTIST, UNKNOWN_ARTIST), None);
        assert_eq!(matchable(UNKNOWN_ALBUM, UNKNOWN_ALBUM), None);
    }

    /// The prefilter and the scorer must classify a tag identically, or the
    /// query and the ranking disagree: a tag the prefilter accepts but the
    /// scorer rejects fetches rows that all score zero, and a tag the scorer
    /// would have used but the prefilter refused never reaches it at all.
    ///
    /// Asserted through the scorer's observable behaviour — two tracks sharing
    /// a tag score above zero exactly when that tag is matchable — because the
    /// core's own guard is private on purpose.
    #[test]
    fn the_prefilter_and_the_scorer_agree_on_what_a_real_tag_is() {
        for tag in ["Aoi", "", UNKNOWN_ARTIST] {
            let seed = SimilarityTrack {
                track_id: "seed".to_owned(),
                artist: tag.to_owned(),
                album: String::new(),
            };
            let candidate = SimilarityTrack {
                track_id: "other".to_owned(),
                artist: tag.to_owned(),
                album: String::new(),
            };

            let scored =
                similarity_score(&seed, &candidate, 0, &SimilarityWeights::default()) > 0.0;

            assert_eq!(
                matchable(tag, UNKNOWN_ARTIST).is_some(),
                scored,
                "the prefilter and the scorer disagree about `{tag}`"
            );
        }
    }
}
