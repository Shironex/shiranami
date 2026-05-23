/**
 * Listening-affinity scoring. Ranks tracks the user already plays by how much
 * they seem to love them, so the desktop adapter can pick the strongest seeds
 * for a "more of what you play" shelf and for yt-dlp RD-mix discovery.
 *
 * The formula mirrors the data-lens query 5a but lives here in pure TS so it is
 * unit-testable and shareable: a recency-decayed, completion-weighted play
 * count, lifted by a favorite boost. There is no negative/skip signal in the
 * schema today, so this only ranks positives — see the data-lens G1 note.
 */

import type { AffinityOptions, ScoredTrack, TrackStats } from './types.js';

const DEFAULT_HALF_LIFE_DAYS = 14;
const DEFAULT_FAVORITE_BOOST = 0.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the affinity score for a single track's stats.
 *
 * `frequency × avgCompletion` is the base engagement, decayed by how long ago
 * the track was last played (exponential half-life), then lifted by the
 * favorite boost. Completion acts as a quality gate — a track played many times
 * but always abandoned early scores below one played fewer times to completion.
 *
 * Returns 0 for tracks with no plays, an unparseable `lastPlayedAt`, or a
 * future timestamp clamped to "now" (no negative ages).
 */
export function affinityScore(stats: TrackStats, options: AffinityOptions = {}): number {
  const halfLifeDays =
    options.halfLifeDays && options.halfLifeDays > 0
      ? options.halfLifeDays
      : DEFAULT_HALF_LIFE_DAYS;
  const favoriteBoost = options.favoriteBoost ?? DEFAULT_FAVORITE_BOOST;
  const now = options.now ?? Date.now();

  if (stats.plays <= 0) return 0;

  const lastPlayedMs = Date.parse(stats.lastPlayedAt);
  if (Number.isNaN(lastPlayedMs)) return 0;

  // Clamp completion into [0, 1] so a malformed row can't inflate the score,
  // and clamp age at 0 so a clock-skewed future timestamp doesn't amplify it.
  const completion = clamp01(stats.avgCompletion);
  const ageDays = Math.max(0, (now - lastPlayedMs) / MS_PER_DAY);
  const recency = Math.pow(0.5, ageDays / halfLifeDays);

  const base = stats.plays * completion * recency;
  const boost = stats.isFavorite ? 1 + favoriteBoost : 1;

  return base * boost;
}

/**
 * Score every track and return them ranked by affinity, highest first. Ties
 * break on more recent `lastPlayedAt` (matches the Overview top-tracks
 * tie-break: `ORDER BY COUNT(*) DESC, MAX(played_at) DESC`). Tracks scoring 0
 * are dropped so seed selection never picks a never-engaged track.
 */
export function rankByAffinity(
  stats: readonly TrackStats[],
  options: AffinityOptions = {}
): ScoredTrack[] {
  return stats
    .map(track => ({
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      score: affinityScore(track, options),
      lastPlayedAt: track.lastPlayedAt,
    }))
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt))
    .map(({ lastPlayedAt: _lastPlayedAt, ...scored }) => scored);
}

/**
 * Convenience wrapper: the top-N seed tracks by affinity. The desktop adapter
 * resolves these to `youtube_mappings.youtubeId` for RD-mix discovery.
 */
export function selectSeedTracks(
  stats: readonly TrackStats[],
  count: number,
  options: AffinityOptions = {}
): ScoredTrack[] {
  if (count <= 0) return [];
  return rankByAffinity(stats, options).slice(0, count);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
