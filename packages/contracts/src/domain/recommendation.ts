// Recommendation contracts shared between the desktop main process (affinity
// query + yt-dlp RD-mix discovery) and the renderer. The renderer is read-only
// over these — it consumes precomputed shelves from the cache and never
// triggers scoring or yt-dlp itself.

/** Shelf identifiers. One cache row + one renderer section per kind. */
export type RecommendationKind = 'library' | 'discover';

/**
 * A track on the "Recommended from your library" shelf — an existing local
 * track surfaced by affinity ranking. `trackId` is the local `tracks.id`, so
 * the renderer plays it through the normal library queue.
 */
export interface LibraryRecommendation {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
}

/**
 * A track on the "Discover new music" shelf — pulled from a YouTube RD mix and
 * NOT in the local library. `youtubeId` is the video id; the renderer routes a
 * click through the existing search/download flow (yt-dlp), so no new playback
 * path is needed.
 */
export interface DiscoverRecommendation {
  youtubeId: string;
  title: string;
  uploader: string;
  thumbnail: string;
  /** Watch URL, for the download/import path. */
  url: string;
}

/**
 * One shelf's cached result. `generatedAt` is the ISO instant it was produced;
 * `stale` is computed at read time (older than the 24h TTL). An empty `items`
 * array is a valid result — for `discover` it means yt-dlp returned nothing or
 * degraded, which the shelf renders as a quiet empty state, never an error.
 */
export interface RecommendationShelf<TItem> {
  kind: RecommendationKind;
  items: TItem[];
  generatedAt: string | null;
  stale: boolean;
}

export type LibraryShelf = RecommendationShelf<LibraryRecommendation>;
export type DiscoverShelf = RecommendationShelf<DiscoverRecommendation>;

/** Both shelves, as returned by the single read channel. */
export interface RecommendationShelves {
  library: LibraryShelf;
  discover: DiscoverShelf;
}

/** Time-to-live for a cached shelf before it is considered stale (24 hours). */
export const RECOMMENDATION_TTL_MS = 24 * 60 * 60 * 1000;
