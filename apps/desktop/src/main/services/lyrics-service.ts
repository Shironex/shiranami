import { UNKNOWN_ALBUM } from '@shiranami/shared';
import { getLrclibGate } from '../app/http';
import { logger } from '../app/logger';
import { store } from '../app/store';
import { isPathAllowed } from '../shared/folders-cache';
import { coalesce } from '../utils/coalesce';
import { readEmbeddedLyrics } from './embedded-lyrics';
import { loadLocalLyrics } from './local-lyrics';
import {
  hasPlainLyrics,
  hasSyncedLyrics,
  parseLrc,
  type LyricLine,
  type LyricsResult,
} from './lyrics-parse';

export { parseLrc };
export type { LyricLine, LyricsResult };

// In-memory cache for current session. Only network (LRCLIB) results are
// cached — local/embedded sources are re-read from disk on every fetch so
// newly added or edited lyric files show up without a restart.
const lyricsCache = new Map<string, LyricsResult>();
const LYRICS_CACHE_MAX = 200;

function getCacheKey(title: string, artist: string): string {
  return `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
}

function cacheGet(key: string): LyricsResult | undefined {
  const value = lyricsCache.get(key);
  if (value !== undefined) {
    // Promote to most-recently-used by deleting and re-inserting
    lyricsCache.delete(key);
    lyricsCache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: LyricsResult): void {
  if (lyricsCache.has(key)) {
    lyricsCache.delete(key);
  } else if (lyricsCache.size >= LYRICS_CACHE_MAX) {
    const oldest = lyricsCache.keys().next().value;
    if (oldest !== undefined) lyricsCache.delete(oldest);
  }
  lyricsCache.set(key, value);
}

/**
 * Build a list of search queries to try, from most specific to least.
 * Handles common metadata issues like "ARTIST - TITLE" in the title field.
 */
export function buildSearchQueries(title: string, artist: string): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  const add = (q: string) => {
    const normalized = q.trim().replace(/\s+/g, ' ');
    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      queries.push(normalized);
    }
  };

  // 1. Full "title artist"
  add(`${title} ${artist}`);

  // 2. Title alone (often contains "ARTIST - SONG" from filename)
  add(title);

  // 3. If title contains " - ", split and try both parts as search terms
  if (title.includes(' - ')) {
    const parts = title
      .split(' - ')
      .map(p => p.trim())
      .filter(Boolean);
    // Try "part1 part2" without the dash
    add(parts.join(' '));
    // Try reversed: "part2 part1" (handles "ARTIST - TITLE" format)
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
    }
  }

  // 4. If title contains " – " (en-dash variant)
  if (title.includes(' – ')) {
    const parts = title
      .split(' – ')
      .map(p => p.trim())
      .filter(Boolean);
    add(parts.join(' '));
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
    }
  }

  return queries;
}

const EMPTY_RESULT: LyricsResult = { synced: null, plain: null, source: null };

/**
 * Fetch lyrics from LRCLIB. Returns the result on a hit, EMPTY_RESULT when
 * LRCLIB definitively has nothing (cacheable), or null on failure (not
 * cacheable, so a transient network error doesn't stick for the session).
 */
async function fetchFromLrclib(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsResult | null> {
  try {
    // Lazy import — keeps the dependency off the startup path (and mockable).
    const { Client } = await import('lrclib-api');
    const client = new Client();

    const query = {
      track_name: title,
      artist_name: artist,
      ...(album && album !== UNKNOWN_ALBUM ? { album_name: album } : {}),
      ...(duration && duration > 0 ? { duration: Math.round(duration * 1000) } : {}),
    };

    logger.debug(`[lyrics] Fetching lyrics for: ${title} - ${artist}`);

    type FindResult = { syncedLyrics?: string | null; plainLyrics?: string | null } | null;
    let result: FindResult = null;
    try {
      // lrclib-api uses global fetch; we can only enforce spacing here, not
      // honor Retry-After the way the electron-net path does.
      result = await getLrclibGate().run<FindResult>(() => client.findLyrics(query));
    } catch (err) {
      // Any error (NotFound, NoResult, RequestError) — fall through to search
      logger.debug('[lyrics] findLyrics failed, falling through to search', err);
    }

    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      // Try multiple search strategies — metadata is often imprecise
      const searchQueries = buildSearchQueries(title, artist);
      for (const sq of searchQueries) {
        try {
          type SearchResult = Array<{ syncedLyrics?: string | null; plainLyrics?: string | null }>;
          const searchResults = await getLrclibGate().run<SearchResult>(() =>
            client.searchLyrics({ query: sq })
          );
          if (searchResults && searchResults.length > 0) {
            const best = searchResults[0];
            logger.info(`[lyrics] Found lyrics via search "${sq}" for: ${title} - ${artist}`);
            return {
              synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
              plain: best.plainLyrics || null,
              source: 'lrclib',
            };
          }
        } catch (err) {
          // This search variant failed, try next
          logger.debug('[lyrics] search variant failed', err);
        }
      }

      logger.debug(`[lyrics] No lyrics found for: ${title} - ${artist}`);
      return EMPTY_RESULT;
    }

    const lyricsResult: LyricsResult = {
      synced: result.syncedLyrics ? parseLrc(result.syncedLyrics) : null,
      plain: result.plainLyrics || null,
      source: 'lrclib',
    };
    logger.info(
      `[lyrics] Found ${lyricsResult.synced ? 'synced' : 'plain'} lyrics via lrclib for: ${title} - ${artist}`
    );
    return lyricsResult;
  } catch (error) {
    logger.warn(`[lyrics] Failed to fetch lyrics for: ${title} - ${artist}`, error);
    return null;
  }
}

function getPreferSyncedFromLrclib(): boolean {
  return store.get('lyrics.preferSyncedFromLrclib') === true;
}

/**
 * Containment gate shared with the audio-protocol and shell handlers: only
 * paths inside the library roots / userData / the tracks table may be probed,
 * so a compromised renderer can't use this channel to read arbitrary
 * .lrc/.txt files. Non-file inputs (radio-stream pseudo-paths) are denied
 * here too and fall through to the LRCLIB path.
 */
async function isLocalResolutionAllowed(filePath: string): Promise<boolean> {
  try {
    if (await isPathAllowed(filePath)) return true;
    logger.debug(`[lyrics] Local lyric resolution skipped (path not allowed): ${filePath}`);
  } catch (error) {
    logger.warn('[lyrics] isPathAllowed threw for:', filePath, error);
  }
  return false;
}

// In-flight network fetches keyed like the cache, so concurrent requests for
// the same track (e.g. a settings invalidation racing a panel mount) share
// one LRCLIB chain instead of double-occupying the rate-limit gate.
const inflightLrclib = new Map<string, Promise<LyricsResult | null>>();

/** LRCLIB with session memoization: LRU for results, in-flight dedup for concurrent calls. */
async function getCachedLrclib(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsResult | null> {
  const key = getCacheKey(title, artist);
  const cached = cacheGet(key);
  if (cached) return cached;

  const result = await coalesce(inflightLrclib, key, () =>
    fetchFromLrclib(title, artist, album, duration)
  );
  if (result) cacheSet(key, result);
  return result;
}

/**
 * Fetch lyrics for a track. When `filePath` is provided, local sources are
 * checked first — sidecar .lrc/.txt, a Lyrics/ subfolder, then embedded tags.
 *
 * Precedence with `lyrics.preferSyncedFromLrclib` OFF (default):
 *   local(synced) → embedded(synced) → local(plain) → embedded(plain) →
 *   lrclib(synced) → lrclib(plain)
 *   — any local/embedded hit skips the network call entirely.
 *
 * Precedence with the setting ON:
 *   local(synced) → embedded(synced) → lrclib(synced) →
 *   local(plain) → embedded(plain) → lrclib(plain)
 *
 * Without `filePath`, behaves as before: LRCLIB only.
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number,
  filePath?: string
): Promise<LyricsResult> {
  let local: LyricsResult | null = null;
  let embedded: LyricsResult | null = null;

  if (filePath && (await isLocalResolutionAllowed(filePath))) {
    try {
      local = await loadLocalLyrics(filePath);
    } catch (error) {
      // The resolver handles its own expected failures — reaching here is a
      // bug, and it silently degrades the track to network-only lyrics.
      logger.warn('[lyrics] loadLocalLyrics threw for:', filePath, error);
    }

    // A synced local file always wins — skip the (relatively expensive)
    // embedded tag parse and the network entirely.
    if (hasSyncedLyrics(local)) {
      logger.info(`[lyrics] Using local synced lyrics for: ${title} - ${artist}`);
      return local;
    }

    try {
      embedded = await readEmbeddedLyrics(filePath);
    } catch (error) {
      logger.warn('[lyrics] readEmbeddedLyrics threw for:', filePath, error);
    }

    // Embedded synced lyrics outrank LRCLIB in both toggle states.
    if (hasSyncedLyrics(embedded)) {
      logger.info(`[lyrics] Using embedded synced lyrics for: ${title} - ${artist}`);
      return embedded;
    }
  }

  const preferSyncedFromLrclib = getPreferSyncedFromLrclib();

  // Default (setting OFF): any local/embedded content beats LRCLIB, so a
  // plain local hit also skips the network call.
  if (!preferSyncedFromLrclib) {
    const winner = hasPlainLyrics(local) ? local : hasPlainLyrics(embedded) ? embedded : null;
    if (winner) {
      logger.info(`[lyrics] Using ${winner.source} lyrics for: ${title} - ${artist}`);
      return winner;
    }
  }

  // LRCLIB is needed to complete the decision (memory-cached per session).
  const lrclib = await getCachedLrclib(title, artist, album, duration);

  const orderedCandidates: Array<LyricsResult | null> = preferSyncedFromLrclib
    ? [
        hasSyncedLyrics(lrclib) ? lrclib : null,
        hasPlainLyrics(local) ? local : null,
        hasPlainLyrics(embedded) ? embedded : null,
        hasPlainLyrics(lrclib) ? lrclib : null,
      ]
    : [hasSyncedLyrics(lrclib) ? lrclib : null, hasPlainLyrics(lrclib) ? lrclib : null];

  const winner = orderedCandidates.find((c): c is LyricsResult => c !== null);
  if (winner) {
    logger.info(
      `[lyrics] Using ${winner.source} ${winner.synced ? 'synced' : 'plain'} lyrics for: ${title} - ${artist}`
    );
    return winner;
  }

  return EMPTY_RESULT;
}
