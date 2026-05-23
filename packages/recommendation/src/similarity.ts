/**
 * Content-based similarity. Given a seed track and a candidate pool, scores
 * each candidate by content overlap with the seed: shared artist, shared album,
 * and shared playlist membership.
 *
 * Genre is intentionally NOT a signal — it is a single sentinel-defaulted
 * string in this schema and too sparse to drive recommendations (data-lens
 * §1, research §10.2). Artist/album co-membership and playlist co-membership
 * are the reliable axes. Sentinel values (`Unknown Artist` / `Unknown Album`)
 * are guarded so untagged tracks never falsely match each other.
 */

import {
  UNKNOWN_ALBUM,
  UNKNOWN_ARTIST,
  type SharedPlaylistCounts,
  type SimilarityTrack,
  type SimilarityWeights,
  type SimilarTrack,
} from './types.js';

const DEFAULT_WEIGHTS: Required<SimilarityWeights> = {
  sameArtist: 3,
  sameAlbum: 2,
  perSharedPlaylist: 1,
};

/**
 * Score one candidate against the seed. `sharedPlaylists` is the number of
 * playlists the candidate shares with the seed (0 when none / unknown).
 * Returns 0 for the seed itself and for candidates with no overlap.
 */
export function similarityScore(
  seed: SimilarityTrack,
  candidate: SimilarityTrack,
  sharedPlaylists: number,
  weights: SimilarityWeights = {}
): number {
  if (candidate.trackId === seed.trackId) return 0;

  const w = { ...DEFAULT_WEIGHTS, ...weights };
  let score = 0;

  if (isRealArtist(seed.artist) && candidate.artist === seed.artist) {
    score += w.sameArtist;
  }
  if (isRealAlbum(seed.album) && candidate.album === seed.album) {
    score += w.sameAlbum;
  }
  if (sharedPlaylists > 0) {
    score += sharedPlaylists * w.perSharedPlaylist;
  }

  return score;
}

/**
 * Rank a candidate pool by content similarity to the seed, highest first.
 * Candidates scoring 0 (no overlap, or the seed itself) are dropped. Ties keep
 * input order, which is stable in V8's sort.
 */
export function rankBySimilarity(
  seed: SimilarityTrack,
  candidates: readonly SimilarityTrack[],
  sharedPlaylists: SharedPlaylistCounts = {},
  weights: SimilarityWeights = {}
): SimilarTrack[] {
  return candidates
    .map(candidate => ({
      trackId: candidate.trackId,
      artist: candidate.artist,
      album: candidate.album,
      similarity: similarityScore(
        seed,
        candidate,
        sharedPlaylists[candidate.trackId] ?? 0,
        weights
      ),
    }))
    .filter(scored => scored.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);
}

function isRealArtist(artist: string): boolean {
  return artist.length > 0 && artist !== UNKNOWN_ARTIST;
}

function isRealAlbum(album: string): boolean {
  return album.length > 0 && album !== UNKNOWN_ALBUM;
}
