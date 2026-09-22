//! Content-based similarity, ported from
//! `packages/recommendation/src/similarity.ts`.
//!
//! Given a seed track and a candidate pool, scores each candidate by content
//! overlap with the seed: shared artist, shared album, and shared playlist
//! membership.
//!
//! Genre is intentionally NOT a signal — it is a single sentinel-defaulted
//! string in this schema and too sparse to drive recommendations (data-lens §1,
//! research §10.2). Artist/album co-membership and playlist co-membership are
//! the reliable axes. The sentinels (`Unknown Artist` / `Unknown Album`) are
//! guarded so untagged tracks never falsely match each other; they come from
//! [`shiranami_core`], which mirrors the literals baked into shipped migration
//! SQL, so the core and the desktop adapter still compare against one canonical
//! value the way the TypeScript re-export did.

use shiranami_core::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};

use crate::core::types::{SharedPlaylistCounts, SimilarTrack, SimilarityTrack, SimilarityWeights};

const DEFAULT_SAME_ARTIST: f64 = 3.0;
const DEFAULT_SAME_ALBUM: f64 = 2.0;
const DEFAULT_PER_SHARED_PLAYLIST: f64 = 1.0;

/// Score one candidate against the seed. `shared_playlists` is the number of
/// playlists the candidate shares with the seed (0 when none / unknown).
/// Returns 0 for the seed itself and for candidates with no overlap.
pub fn similarity_score(
    seed: &SimilarityTrack,
    candidate: &SimilarityTrack,
    shared_playlists: u32,
    weights: &SimilarityWeights,
) -> f64 {
    if candidate.track_id == seed.track_id {
        return 0.0;
    }

    let mut score = 0.0;

    // Only the *seed* is sentinel-checked, as in TypeScript: if the seed's tag
    // is real, a candidate that equals it is real by construction.
    if is_real_artist(&seed.artist) && candidate.artist == seed.artist {
        score += weights.same_artist.unwrap_or(DEFAULT_SAME_ARTIST);
    }
    if is_real_album(&seed.album) && candidate.album == seed.album {
        score += weights.same_album.unwrap_or(DEFAULT_SAME_ALBUM);
    }
    if shared_playlists > 0 {
        score += f64::from(shared_playlists)
            * weights
                .per_shared_playlist
                .unwrap_or(DEFAULT_PER_SHARED_PLAYLIST);
    }

    score
}

/// Rank a candidate pool by content similarity to the seed, highest first.
///
/// Candidates scoring 0 (no overlap, or the seed itself) are dropped. Ties keep
/// input order — the TypeScript relied on V8's sort being stable, and
/// `slice::sort_by` is stable for the same reason.
pub fn rank_by_similarity(
    seed: &SimilarityTrack,
    candidates: &[SimilarityTrack],
    shared_playlists: &SharedPlaylistCounts,
    weights: &SimilarityWeights,
) -> Vec<SimilarTrack> {
    let mut ranked: Vec<SimilarTrack> = candidates
        .iter()
        .filter_map(|candidate| {
            let shared = shared_playlists
                .get(&candidate.track_id)
                .copied()
                .unwrap_or(0);
            let similarity = similarity_score(seed, candidate, shared, weights);
            if similarity <= 0.0 || similarity.is_nan() {
                return None;
            }
            Some(SimilarTrack {
                track_id: candidate.track_id.clone(),
                artist: candidate.artist.clone(),
                album: candidate.album.clone(),
                similarity,
            })
        })
        .collect();

    ranked.sort_by(|left, right| right.similarity.total_cmp(&left.similarity));
    ranked
}

/// A tag worth matching on: present, and not the scanner's missing-tag
/// sentinel.
fn is_real_artist(artist: &str) -> bool {
    !artist.is_empty() && artist != UNKNOWN_ARTIST
}

/// See [`is_real_artist`].
fn is_real_album(album: &str) -> bool {
    !album.is_empty() && album != UNKNOWN_ALBUM
}
