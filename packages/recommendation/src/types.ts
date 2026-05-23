/**
 * Input/output shapes for the pure recommendation scoring core.
 *
 * Everything here is plain data — no DB rows, no IPC, no yt-dlp. The desktop
 * (and, later, mobile) adapters are responsible for projecting their own
 * storage into these shapes and consuming the ranked output. Keeping the core
 * data-only is what lets a single algorithm be shared across platforms that do
 * not share a data layer.
 */

/**
 * Per-track listening signal aggregated from `play_history` + `tracks`. One
 * entry per track the user has actually played. `plays` / `avgCompletion` /
 * `lastPlayedAt` come straight from the grouped affinity query; the content
 * axes (`artist`/`album`) and `isFavorite` come from the joined `tracks` row.
 */
export interface TrackStats {
  trackId: string;
  /** Display title — passed through for the caller, not used in scoring. */
  title: string;
  artist: string;
  album: string;
  /** Total play_history rows for this track (frequency signal). */
  plays: number;
  /** Mean completion_ratio across those plays, 0..1 (engagement depth). */
  avgCompletion: number;
  /** ISO-8601 timestamp of the most recent play (recency signal). */
  lastPlayedAt: string;
  /** Explicit positive signal — boosts affinity when set. */
  isFavorite: boolean;
}

/** A track scored and ranked by listening affinity. */
export interface ScoredTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  /** Composite affinity score; higher means a stronger seed candidate. */
  score: number;
}

/** Knobs for the affinity score. Defaults match the data-lens query 5a. */
export interface AffinityOptions {
  /**
   * Recency half-life in days. A play contributes `0.5^(ageDays/halfLife)` of
   * its weight, so a 14-day half-life means a two-week-old play counts half as
   * much as a fresh one. Must be > 0.
   */
  halfLifeDays?: number;
  /** Multiplicative boost applied to favorited tracks (e.g. 0.5 → +50%). */
  favoriteBoost?: number;
  /**
   * Reference instant for the recency decay. Defaults to `Date.now()`.
   * Injectable so tests are deterministic and the caller can score against a
   * fixed "as of" time.
   */
  now?: number;
}

/**
 * Minimal track shape for content-based similarity. Includes the candidate's
 * id plus the two reliable content axes (artist/album). Genre is deliberately
 * excluded — it is sparse / single-valued in this schema (research §10.2).
 */
export interface SimilarityTrack {
  trackId: string;
  artist: string;
  album: string;
}

/**
 * Playlist co-membership counts for a seed: for each candidate track id, how
 * many playlists it shares with the seed. The desktop adapter computes this
 * with the join in data-lens query 5b; the core just folds it into the score.
 */
export type SharedPlaylistCounts = Readonly<Record<string, number>>;

/** A candidate scored by content similarity to a seed track. */
export interface SimilarTrack {
  trackId: string;
  artist: string;
  album: string;
  /** Similarity score; higher means more content overlap with the seed. */
  similarity: number;
}

/** Weights for content-similarity signals. Defaults match data-lens query 5b. */
export interface SimilarityWeights {
  /** Points for a shared, non-sentinel artist. */
  sameArtist?: number;
  /** Points for a shared, non-sentinel album. */
  sameAlbum?: number;
  /** Points per shared playlist membership. */
  perSharedPlaylist?: number;
}

/** Sentinel values the scanner writes for missing tags — never a real match. */
export const UNKNOWN_ARTIST = 'Unknown Artist';
export const UNKNOWN_ALBUM = 'Unknown Album';
