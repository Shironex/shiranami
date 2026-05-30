/**
 * Desktop recommendation service.
 *
 * Owns the two recommendation shelves and their SQLite cache:
 *  - "library"  : existing tracks ranked by listening affinity (offline,
 *                 reuses the play_history aggregate patterns from
 *                 ipc/database/history.ts; scored by @shiranami/recommendation).
 *  - "discover" : NEW tracks pulled from YouTube RD mixes (yt-dlp), seeded by
 *                 the user's top affinity tracks, deduped against the library.
 *
 * Reads come from the `recommendations` cache table (TTL-checked). The discover
 * shelf spawns yt-dlp and so is only ever computed in a bounded BACKGROUND job
 * (scheduleRecommendationRefresh / refreshRecommendations), never on the render
 * path. Any yt-dlp failure degrades that shelf to empty — it never throws up to
 * the renderer.
 */

import * as crypto from 'crypto';
import { getDatabase } from '@shiranami/database/client';
import {
  tracks,
  playHistory,
  youtubeMappings,
  recommendations,
  negativeSignals,
  eq,
  sql,
  inArray,
  type NewRecommendation,
  type NewNegativeSignal,
} from '@shiranami/database';
import {
  rankByAffinity,
  rankBySimilarity,
  selectSeedTracks,
  buildSmartMixes,
  type SharedPlaylistCounts,
  type SimilarityTrack,
  type TrackStats,
  type MixTrack,
} from '@shiranami/recommendation';
import { playlistTracks } from '@shiranami/database';
import {
  RECOMMENDATION_TTL_MS,
  SIMILAR_TRACKS_MAX,
  type DiscoverRecommendation,
  type DiscoverShelf,
  type LibraryRecommendation,
  type LibraryShelf,
  type RecommendationKind,
  type RecommendationShelves,
  type SimilarTrackResult,
  type SmartMixSignals,
  type SmartMixResult,
} from '@shiranami/contracts';
import { logger } from './logger';
import { spawnYtDlp, appendUrlArg, parseYtDlpJsonLines } from './utils/ytdlp-spawn';
import { isYtDlpInstalled } from './ytdlp-manager';

/** How many top-affinity tracks seed the discover shelf. One RD mix already
 *  yields ~25 candidates, so a couple of seeds covers a shelf. */
const DISCOVER_SEED_COUNT = 3;

/** Bounded concurrency for the parallel RD-mix fetches — matches the proven
 *  ENRICH_CONCURRENCY worker-pool size from metadata-enrich-batch.ts. */
const DISCOVER_CONCURRENCY = 4;

/** Cap on discover items written to the cache, across all seed mixes. */
const DISCOVER_MAX_ITEMS = 24;

/** Cap on library affinity items written to the cache. */
const LIBRARY_MAX_ITEMS = 20;

/** Idle delay after startup before the first background refresh runs. */
const REFRESH_STARTUP_DELAY_MS = 30_000;

// ───────────────────────────── library affinity ─────────────────────────────

/**
 * Aggregate play_history + tracks into the per-track listening stats the pure
 * scoring core consumes. Mirrors the grouped query behind the Overview top
 * tracks (history.ts getSummary) so affinity ranking sanity-checks against it.
 */
function getLibraryStats(): TrackStats[] {
  const db = getDatabase();
  const rows = db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      album: tracks.album,
      plays: sql<number>`COUNT(*)`,
      avgCompletion: sql<number>`COALESCE(AVG(${playHistory.completionRatio}), 0)`,
      lastPlayedAt: sql<string>`MAX(${playHistory.playedAt})`,
      isFavorite: tracks.isFavorite,
    })
    .from(playHistory)
    .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
    .groupBy(tracks.id)
    .all();

  // Negative signal: the exact track ids the user disliked, and the count of
  // dislikes per artist (so the pure core can drop the track and softly
  // downrank its artist). Read once and folded into each stats row below.
  const dislikedTrackIds = getDislikedTrackIds();
  const artistDislikeCounts = getArtistDislikeCounts();

  return rows.map(row => {
    const artist = row.artist ?? '';
    return {
      trackId: row.trackId,
      title: row.title,
      artist,
      album: row.album ?? '',
      plays: Number(row.plays),
      avgCompletion: Number(row.avgCompletion),
      lastPlayedAt: row.lastPlayedAt,
      isFavorite: Boolean(row.isFavorite),
      isDisliked: dislikedTrackIds.has(row.trackId),
      // Don't penalize a track for its OWN dislike via the artist count — the
      // exact-track drop already handles that. Subtract one when this track is
      // itself the disliked one for the artist.
      artistDislikes: Math.max(
        0,
        (artist ? (artistDislikeCounts.get(artist) ?? 0) : 0) -
          (dislikedTrackIds.has(row.trackId) ? 1 : 0)
      ),
    };
  });
}

// ───────────────────────────── negative signal ──────────────────────────────

/** Set of track ids the user explicitly marked "Not interested". */
function getDislikedTrackIds(): Set<string> {
  const db = getDatabase();
  const rows = db.select({ trackId: negativeSignals.trackId }).from(negativeSignals).all();
  return new Set(rows.map(row => row.trackId));
}

/** Count of "Not interested" marks per artist (denormalized at write time). */
function getArtistDislikeCounts(): Map<string, number> {
  const db = getDatabase();
  const rows = db
    .select({ artist: negativeSignals.artist, count: sql<number>`COUNT(*)` })
    .from(negativeSignals)
    .where(sql`${negativeSignals.artist} IS NOT NULL`)
    .groupBy(negativeSignals.artist)
    .all();
  return new Map(rows.map(row => [row.artist ?? '', Number(row.count)]));
}

/**
 * Record a "Not interested" signal for a track. Idempotent — re-marking the
 * same track is a no-op (track_id is unique). The artist is denormalized from
 * the track row so the artist-level penalty survives independent of joins.
 * Invalidates the cached library shelf so the next read re-scores without the
 * disliked track. Returns nothing; never throws up to the renderer past the
 * IPC validator.
 */
export function markNotInterested(trackId: string, source = 'context-menu'): void {
  const db = getDatabase();
  const track = db
    .select({ artist: tracks.artist })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .get();

  const row: NewNegativeSignal = {
    id: crypto.randomUUID(),
    trackId,
    artist: track?.artist ?? null,
    source,
  };
  db.insert(negativeSignals)
    .values(row)
    .onConflictDoUpdate({
      target: negativeSignals.trackId,
      set: { artist: row.artist, source: row.source },
    })
    .run();

  invalidateLibraryCache();
  logger.info(`[recommendations] marked track ${trackId} not interested`);
}

/** Undo a "Not interested" mark, so the track can be surfaced again. */
export function undoNotInterested(trackId: string): void {
  const db = getDatabase();
  db.delete(negativeSignals).where(eq(negativeSignals.trackId, trackId)).run();
  invalidateLibraryCache();
  logger.info(`[recommendations] undo not-interested for track ${trackId}`);
}

/**
 * Drop the cached library shelf so the next `getRecommendationShelves()` read
 * recomputes affinity (now accounting for the negative signal). The discover
 * cache is left intact — it is refreshed only by the background job.
 */
function invalidateLibraryCache(): void {
  const db = getDatabase();
  db.delete(recommendations).where(eq(recommendations.kind, 'library')).run();
}

/** Album art lookup for a set of track ids, so library recommendations can
 *  show covers without the renderer re-querying. */
function getAlbumArtFor(trackIds: string[]): Map<string, string | null> {
  if (trackIds.length === 0) return new Map();
  const db = getDatabase();
  const rows = db
    .select({ id: tracks.id, albumArt: tracks.albumArt })
    .from(tracks)
    .where(inArray(tracks.id, trackIds))
    .all();
  return new Map(rows.map(row => [row.id, row.albumArt ?? null]));
}

/** Compute the "Recommended from your library" items (no network). */
function computeLibraryItems(): LibraryRecommendation[] {
  const stats = getLibraryStats();
  const ranked = rankByAffinity(stats).slice(0, LIBRARY_MAX_ITEMS);
  const art = getAlbumArtFor(ranked.map(track => track.trackId));
  return ranked.map(track => ({
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArt: art.get(track.trackId) ?? null,
  }));
}

// ─────────────────────────── content similarity ─────────────────────────────

/** Project every library track into the minimal content shape the similarity
 *  core consumes (id + the two reliable axes, artist/album). */
function getSimilarityTracks(): SimilarityTrack[] {
  const db = getDatabase();
  const rows = db
    .select({ trackId: tracks.id, artist: tracks.artist, album: tracks.album })
    .from(tracks)
    .all();
  return rows.map(row => ({
    trackId: row.trackId,
    artist: row.artist ?? '',
    album: row.album ?? '',
  }));
}

/**
 * For a seed track, count how many playlists each OTHER track shares with it.
 * Mirrors data-lens query 5b: find the seed's playlists, then group the tracks
 * in those playlists by track id. The seed itself is excluded.
 */
function getSharedPlaylistCounts(seedTrackId: string): SharedPlaylistCounts {
  const db = getDatabase();
  const seedPlaylists = db
    .select({ playlistId: playlistTracks.playlistId })
    .from(playlistTracks)
    .where(eq(playlistTracks.trackId, seedTrackId))
    .all()
    .map(row => row.playlistId);
  if (seedPlaylists.length === 0) return {};

  const rows = db
    .select({ trackId: playlistTracks.trackId })
    .from(playlistTracks)
    .where(inArray(playlistTracks.playlistId, seedPlaylists))
    .all();

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.trackId === seedTrackId) continue;
    counts[row.trackId] = (counts[row.trackId] ?? 0) + 1;
  }
  return counts;
}

/**
 * "More like this" / song-radio: rank existing library tracks by content
 * similarity to the seed (shared artist/album + playlist co-membership), via
 * the pure @shiranami/recommendation core. Offline; returns [] when the seed is
 * unknown so the renderer renders a quiet empty state.
 */
export function computeSimilarTracks(seedTrackId: string): SimilarTrackResult[] {
  const candidates = getSimilarityTracks();
  const seed = candidates.find(track => track.trackId === seedTrackId);
  if (!seed) {
    logger.info(`[recommendations] similar: seed ${seedTrackId} not in library`);
    return [];
  }

  const sharedPlaylists = getSharedPlaylistCounts(seedTrackId);
  return rankBySimilarity(seed, candidates, sharedPlaylists)
    .slice(0, SIMILAR_TRACKS_MAX)
    .map(track => ({ trackId: track.trackId, similarity: track.similarity }));
}

// ──────────────────────────────── smart mixes ───────────────────────────────

/** Project the `tracks` table into the minimal metadata shape the pure
 *  smart-mix generator consumes (id + genre/year/playCount). */
function getMixTracks(): MixTrack[] {
  const db = getDatabase();
  const rows = db
    .select({
      trackId: tracks.id,
      genre: tracks.genre,
      year: tracks.year,
      playCount: tracks.playCount,
    })
    .from(tracks)
    .all();
  return rows.map(row => ({
    trackId: row.trackId,
    genre: row.genre ?? null,
    year: row.year ?? null,
    playCount: Number(row.playCount ?? 0),
  }));
}

/**
 * Generate mood/activity/decade mixes for the renderer's contextual signals
 * (current hour + optional weather) and the library's metadata. Offline and
 * cheap — safe on the render path — so it is computed on demand rather than
 * cached. Returns [] when no mix reaches the minimum size (e.g. a thin or
 * untagged library), which the renderer renders as a quiet empty state.
 */
export function computeSmartMixes(signals: SmartMixSignals): SmartMixResult[] {
  const mixes = buildSmartMixes(getMixTracks(), {
    hour: signals.hour,
    weather: signals.weather,
  });
  // The pure SmartMix shape is structurally identical to the contract type.
  return mixes.map(mix => ({
    id: mix.id,
    kind: mix.kind,
    titleKey: mix.titleKey,
    descKey: mix.descKey,
    decade: mix.decade,
    trackIds: mix.trackIds,
  }));
}

// ──────────────────────────── yt-dlp discovery ─────────────────────────────

/** Resolve seed track ids to their YouTube video ids (1:1 via the mapping). */
function getSeedYoutubeIds(seedTrackIds: string[]): string[] {
  if (seedTrackIds.length === 0) return [];
  const db = getDatabase();
  const rows = db
    .select({ trackId: youtubeMappings.trackId, youtubeId: youtubeMappings.youtubeId })
    .from(youtubeMappings)
    .where(inArray(youtubeMappings.trackId, seedTrackIds))
    .all();
  // Preserve seed order (highest affinity first) so the strongest seed's mix
  // is fetched first and its tracks win the dedupe.
  const byTrack = new Map(rows.map(row => [row.trackId, row.youtubeId]));
  return seedTrackIds
    .map(id => byTrack.get(id))
    .filter((youtubeId): youtubeId is string => Boolean(youtubeId));
}

/** Every YouTube id already in the library, so discovery only surfaces NEW
 *  music. */
function getLibraryYoutubeIds(): Set<string> {
  const db = getDatabase();
  const rows = db.select({ youtubeId: youtubeMappings.youtubeId }).from(youtubeMappings).all();
  return new Set(rows.map(row => row.youtubeId));
}

/**
 * Fetch one YouTube RD ("radio mix") for a seed video id. Uses the WATCH-URL
 * form (`watch?v=<id>&list=RD<id>`) — the bare playlist URL is unviewable — and
 * the same flat `--flat-playlist --dump-json --no-warnings` arg set as search.
 *
 * BEST-EFFORT: yt-dlp's YouTube extractor is unofficial and breaks (live
 * streams, processing videos, frontend changes). Any failure — non-zero exit,
 * spawn error, parse failure — resolves to [] so the shelf degrades to empty
 * rather than throwing.
 */
async function fetchRdMix(
  seedYoutubeId: string,
  signal?: AbortSignal
): Promise<DiscoverRecommendation[]> {
  const url = `https://www.youtube.com/watch?v=${seedYoutubeId}&list=RD${seedYoutubeId}`;
  try {
    const { stdout, code } = await spawnYtDlp(
      appendUrlArg(['--flat-playlist', '--dump-json', '--no-warnings'], url),
      signal
    );
    if (code !== 0) {
      logger.warn(`[recommendations] RD mix for ${seedYoutubeId} exited ${code}; skipping`);
      return [];
    }
    return parseYtDlpJsonLines(stdout)
      .filter(result => result.id && result.id !== seedYoutubeId)
      .map(result => ({
        youtubeId: result.id,
        title: result.title,
        uploader: result.uploader,
        thumbnail: result.thumbnail,
        url: result.webpage_url || result.url,
      }));
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    logger.warn(`[recommendations] RD mix for ${seedYoutubeId} failed; skipping`, err);
    return [];
  }
}

/**
 * Worker-pool runner over the seed mixes, bounded to DISCOVER_CONCURRENCY.
 * Mirrors the metadata-enrich-batch cursor pattern. Results are merged in seed
 * order; duplicates (across mixes and against the library) are dropped.
 */
async function computeDiscoverItems(signal?: AbortSignal): Promise<DiscoverRecommendation[]> {
  if (!isYtDlpInstalled()) {
    logger.info('[recommendations] yt-dlp not installed; discover shelf stays empty');
    return [];
  }

  const seedTrackIds = selectSeedTracks(getLibraryStats(), DISCOVER_SEED_COUNT).map(
    track => track.trackId
  );
  const seedYoutubeIds = getSeedYoutubeIds(seedTrackIds);
  if (seedYoutubeIds.length === 0) {
    logger.info('[recommendations] no YouTube-mapped seed tracks; discover shelf stays empty');
    return [];
  }

  const libraryIds = getLibraryYoutubeIds();
  const seedSet = new Set(seedYoutubeIds);
  const seen = new Set<string>();
  const merged: DiscoverRecommendation[] = [];

  // Per-seed results slotted by index so the merge preserves seed order even
  // though mixes finish out of order.
  const slots: DiscoverRecommendation[][] = new Array(seedYoutubeIds.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) return;
      const i = nextIndex++;
      if (i >= seedYoutubeIds.length) return;
      slots[i] = await fetchRdMix(seedYoutubeIds[i], signal);
    }
  }

  const poolSize = Math.max(1, Math.min(DISCOVER_CONCURRENCY, seedYoutubeIds.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  for (const items of slots) {
    if (!items) continue;
    for (const item of items) {
      if (merged.length >= DISCOVER_MAX_ITEMS) break;
      if (seen.has(item.youtubeId)) continue;
      if (seedSet.has(item.youtubeId)) continue; // never recommend a seed back
      if (libraryIds.has(item.youtubeId)) continue; // already owned — not "new"
      seen.add(item.youtubeId);
      merged.push(item);
    }
  }

  return merged;
}

// ───────────────────────────────── cache ────────────────────────────────────

function readCacheRow(kind: RecommendationKind): { payload: string; generatedAt: string } | null {
  const db = getDatabase();
  const row = db
    .select({ payload: recommendations.payload, generatedAt: recommendations.generatedAt })
    .from(recommendations)
    .where(eq(recommendations.kind, kind))
    .get();
  return row ?? null;
}

function writeCacheRow(kind: RecommendationKind, items: unknown[]): void {
  const db = getDatabase();
  const row: NewRecommendation = {
    kind,
    payload: JSON.stringify(items),
    generatedAt: new Date().toISOString(),
  };
  db.insert(recommendations)
    .values(row)
    .onConflictDoUpdate({
      target: recommendations.kind,
      set: { payload: row.payload, generatedAt: row.generatedAt },
    })
    .run();
}

/** True when a cache row is missing or older than the 24h TTL. */
function isStale(generatedAt: string | null): boolean {
  if (!generatedAt) return true;
  const ms = Date.parse(generatedAt);
  if (Number.isNaN(ms)) return true;
  return Date.now() - ms > RECOMMENDATION_TTL_MS;
}

function parsePayload<T>(raw: string | null): { items: T[]; valid: boolean } {
  if (!raw) return { items: [], valid: false };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn('[recommendations] cached payload is not an array; marking stale');
      return { items: [], valid: false };
    }
    return { items: parsed as T[], valid: true };
  } catch (err) {
    logger.warn('[recommendations] failed to parse cached payload', err);
    return { items: [], valid: false };
  }
}

function readShelf<T>(kind: RecommendationKind): {
  items: T[];
  generatedAt: string | null;
  stale: boolean;
} {
  const row = readCacheRow(kind);
  const generatedAt = row?.generatedAt ?? null;
  const { items, valid } = parsePayload<T>(row?.payload ?? null);
  return {
    items,
    generatedAt,
    stale: isStale(generatedAt) || !valid,
  };
}

// ───────────────────────────────── public API ───────────────────────────────

/**
 * Read both shelves from the cache. Pure SQLite reads — sub-millisecond, safe
 * on the render path. The library shelf is recomputed inline when its cache is
 * stale/missing (it is offline + cheap); the discover shelf is NEVER recomputed
 * here (it would spawn yt-dlp) — a stale/empty discover shelf is returned as-is
 * and refreshed by the background job.
 */
export function getRecommendationShelves(): RecommendationShelves {
  let library = readShelf<LibraryRecommendation>('library');
  if (library.stale) {
    try {
      const items = computeLibraryItems();
      writeCacheRow('library', items);
      library = { items, generatedAt: new Date().toISOString(), stale: false };
    } catch (err) {
      logger.warn('[recommendations] inline library recompute failed; serving cache', err);
    }
  }

  const discover = readShelf<DiscoverRecommendation>('discover');

  return {
    library: { kind: 'library', ...library } satisfies LibraryShelf,
    discover: { kind: 'discover', ...discover } satisfies DiscoverShelf,
  };
}

/**
 * Recompute BOTH shelves and write them to the cache, then return the fresh
 * shelves. This is the heavy path (spawns yt-dlp for discover) and must only
 * run off the render thread — from the background scheduler or an explicit
 * user-triggered refresh. The discover computation degrades to empty on any
 * yt-dlp failure; the library computation is offline and always succeeds.
 */
export async function refreshRecommendations(signal?: AbortSignal): Promise<RecommendationShelves> {
  const prevLibrary = readShelf<LibraryRecommendation>('library');
  const prevDiscover = readShelf<DiscoverRecommendation>('discover');

  let library: Omit<LibraryShelf, 'kind'> = prevLibrary;
  try {
    const items = computeLibraryItems();
    writeCacheRow('library', items);
    library = { items, generatedAt: new Date().toISOString(), stale: false };
  } catch (err) {
    logger.warn('[recommendations] library refresh failed; serving previous shelf', err);
  }

  let discover: Omit<DiscoverShelf, 'kind'> = prevDiscover;
  try {
    const items = await computeDiscoverItems(signal);
    writeCacheRow('discover', items);
    logger.info(`[recommendations] discover refresh wrote ${items.length} items`);
    discover = { items, generatedAt: new Date().toISOString(), stale: false };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    logger.warn('[recommendations] discover refresh failed; serving previous shelf', err);
  }

  return {
    library: { kind: 'library', ...library } satisfies LibraryShelf,
    discover: { kind: 'discover', ...discover } satisfies DiscoverShelf,
  };
}

let refreshTimer: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<unknown> | null = null;

/**
 * Schedule a single background refresh shortly after startup, only when the
 * discover cache is stale. Idempotent and self-cancelling; fire-and-forget so
 * it never blocks bootstrap. A failed refresh is swallowed (logged) — the
 * shelves simply serve whatever the cache holds.
 */
export function scheduleRecommendationRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const discover = readCacheRow('discover');
    if (!isStale(discover?.generatedAt ?? null)) {
      logger.debug('[recommendations] discover cache warm; skipping background refresh');
      return;
    }
    triggerRefresh();
  }, REFRESH_STARTUP_DELAY_MS);
  refreshTimer.unref?.();
}

/**
 * Run a refresh now, coalescing concurrent callers onto one in-flight run so a
 * user-triggered refresh and the scheduled job never spawn yt-dlp twice.
 */
export function triggerRefresh(): Promise<RecommendationShelves> {
  if (!refreshInFlight) {
    refreshInFlight = refreshRecommendations()
      .catch(err => {
        logger.warn('[recommendations] background refresh failed', err);
        return getRecommendationShelves();
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight as Promise<RecommendationShelves>;
}

/** Cancel a pending scheduled refresh (called on teardown). */
export function cancelRecommendationRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
