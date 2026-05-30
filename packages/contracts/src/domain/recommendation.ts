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
 *
 * The two-parameter generic ties `kind` to the item type so the TypeScript
 * discriminant is enforced: a `LibraryShelf` cannot carry `kind: 'discover'`
 * and vice-versa.
 */
export interface RecommendationShelf<TKind extends RecommendationKind, TItem> {
  kind: TKind;
  items: TItem[];
  generatedAt: string | null;
  stale: boolean;
}

export type LibraryShelf = RecommendationShelf<'library', LibraryRecommendation>;
export type DiscoverShelf = RecommendationShelf<'discover', DiscoverRecommendation>;

/** Both shelves, as returned by the single read channel. */
export interface RecommendationShelves {
  library: LibraryShelf;
  discover: DiscoverShelf;
}

/** Time-to-live for a cached shelf before it is considered stale (24 hours). */
export const RECOMMENDATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * One result of a "More like this" / song-radio request: an existing library
 * track ranked by content similarity to a seed track. `trackId` is the local
 * `tracks.id` so the renderer plays it through the normal library queue.
 * `similarity` is the raw score from the similarity core (higher = closer).
 */
export interface SimilarTrackResult {
  trackId: string;
  similarity: number;
}

/** Maximum number of similar tracks returned for a "More like this" request. */
export const SIMILAR_TRACKS_MAX = 50;

/** Weather buckets the renderer passes to the smart-mix generator. Mirrors the
 *  Open-Meteo `WeatherCondition` union (kept structurally compatible). */
export type SmartMixWeather =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'unknown';

/**
 * Contextual signals the renderer collects (current local hour + optional
 * weather) and passes to the smart-mix IPC. Weather is omitted when the user
 * has not opted into it — the generator degrades to time/decade mixes.
 */
export interface SmartMixSignals {
  hour: number;
  weather?: SmartMixWeather;
}

/**
 * One generated mood/activity/decade mix. `trackIds` are local `tracks.id`s
 * (ranked most-played first) the renderer resolves against the in-memory
 * library and plays through the normal queue. `titleKey`/`descKey` resolve in
 * the `mixes` i18n namespace; `decade` is set only for decade mixes.
 */
export interface SmartMixResult {
  id: string;
  kind: 'focus' | 'late-night' | 'morning' | 'rainy-day' | 'sunny-day' | 'snowy-day' | 'decade';
  titleKey: string;
  descKey: string;
  decade?: number;
  trackIds: string[];
}
