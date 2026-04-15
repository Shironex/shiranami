import path from 'path';
import { logger } from './logger';
import { store } from './store';

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  synced: LyricLine[] | null; // Timestamped lyrics
  plain: string | null; // Plain text lyrics
  source: 'lrclib' | 'cache' | 'local-lrc' | 'local-txt' | 'embedded' | null;
}

// In-memory cache for current session
const lyricsCache = new Map<string, LyricsResult>();
const LYRICS_CACHE_MAX = 200;

function getCacheKey(
  title: string,
  artist: string,
  filePath?: string
): string {
  if (filePath) {
    return `file::${path.normalize(filePath).toLowerCase()}`;
  }
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
 * Parse LRC format string into array of timed lyric lines.
 * Format: [mm:ss.xx]Lyric text
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

  for (const rawLine of lrc.split('\n')) {
    const match = rawLine.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms =
        match[3].length === 2
          ? parseInt(match[3], 10) * 10
          : parseInt(match[3], 10);
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      if (text) {
        lines.push({ time, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
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
    const parts = title.split(' - ').map(p => p.trim()).filter(Boolean);
    // Try "part1 part2" without the dash
    add(parts.join(' '));
    // Try reversed: "part2 part1" (handles "ARTIST - TITLE" format)
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
    }
  }

  // 4. If title contains " – " (en-dash variant)
  if (title.includes(' – ')) {
    const parts = title.split(' – ').map(p => p.trim()).filter(Boolean);
    add(parts.join(' '));
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
    }
  }

  return queries;
}

function hasSynced(r: LyricsResult | null | undefined): boolean {
  return !!r && Array.isArray(r.synced) && r.synced.length > 0;
}

function hasPlain(r: LyricsResult | null | undefined): boolean {
  return !!r && typeof r.plain === 'string' && r.plain.length > 0;
}

async function fetchFromLrclib(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsResult | null> {
  try {
    const { Client } = require('lrclib-api');
    const client = new Client();

    const query = {
      track_name: title,
      artist_name: artist,
      ...(album && album !== 'Unknown Album' ? { album_name: album } : {}),
      ...(duration && duration > 0 ? { duration: Math.round(duration * 1000) } : {}),
    };

    logger.debug(`[lyrics] Fetching lyrics for: ${title} - ${artist}`);

    let result: { syncedLyrics?: string | null; plainLyrics?: string | null } | null = null;
    try {
      result = await client.findLyrics(query);
    } catch {
      // Any error (NotFound, NoResult, RequestError) — fall through to search
    }

    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      // Try multiple search strategies — metadata is often imprecise
      const searchQueries = buildSearchQueries(title, artist);
      for (const sq of searchQueries) {
        try {
          const searchResults = await client.searchLyrics({ query: sq });
          if (searchResults && searchResults.length > 0) {
            const best = searchResults[0];
            const lyricsResult: LyricsResult = {
              synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
              plain: best.plainLyrics || null,
              source: 'lrclib',
            };
            logger.info(`[lyrics] Found lyrics via search "${sq}" for: ${title} - ${artist}`);
            return lyricsResult;
          }
        } catch {
          // This search variant failed, try next
        }
      }

      logger.debug(`[lyrics] No lyrics found for: ${title} - ${artist}`);
      return null;
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
    logger.warn(
      `[lyrics] Failed to fetch lyrics for: ${title} - ${artist}`,
      error
    );
    return null;
  }
}

function getPreferSynced(): boolean {
  try {
    const settings = store.get('settings') as Record<string, unknown> | undefined;
    return settings?.preferSyncedOverLocalPlain !== false; // default true
  } catch {
    return true;
  }
}

/**
 * Fetch lyrics for a track. Precedence when `filePath` is provided:
 *
 *   preferSynced = true:
 *     local(synced) → embedded(synced) → lrclib(synced) →
 *     local(plain) → embedded(plain) → lrclib(plain)
 *
 *   preferSynced = false:
 *     local(synced) → embedded(synced) → local(plain) → embedded(plain) →
 *     lrclib(synced) → lrclib(plain)
 *
 * Without `filePath`, falls back to lrclib-only (legacy behavior).
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number,
  filePath?: string
): Promise<LyricsResult> {
  const key = getCacheKey(title, artist, filePath);

  // Check memory cache
  const cached = cacheGet(key);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  // Resolve local + embedded (in parallel) if filePath is provided
  let local: LyricsResult | null = null;
  let embedded: LyricsResult | null = null;

  if (filePath) {
    try {
      const { loadLocalLyrics } = await import('./local-lyrics');
      local = (await loadLocalLyrics(filePath)) ?? null;
    } catch (error) {
      logger.debug(`[lyrics] loadLocalLyrics threw: ${String(error)}`);
    }

    // Skip embedded parse when local is already synced — it would be
    // discarded by the precedence logic below, and music-metadata
    // parseFile is expensive (disk I/O + tag parse).
    if (!hasSynced(local)) {
      try {
        const { readEmbeddedLyrics } = await import('./embedded-lyrics');
        embedded = (await readEmbeddedLyrics(filePath)) ?? null;
      } catch (error) {
        logger.debug(`[lyrics] readEmbeddedLyrics threw: ${String(error)}`);
      }
    }
  }

  const preferSynced = getPreferSynced();

  // Short-circuit: local synced always wins, skip lrclib entirely.
  if (hasSynced(local)) {
    const winner = local as LyricsResult;
    cacheSet(key, winner);
    logger.info(`[lyrics] Using local synced lyrics for: ${title} - ${artist}`);
    return winner;
  }

  // If preferSynced=false, any local/embedded content (synced or plain) beats
  // lrclib — so we can skip the network call.
  if (!preferSynced) {
    const localPlainCandidate = hasPlain(local) ? local : null;
    const embeddedSyncedCandidate = hasSynced(embedded) ? embedded : null;
    const embeddedPlainCandidate = hasPlain(embedded) ? embedded : null;
    const winner =
      embeddedSyncedCandidate ??
      localPlainCandidate ??
      embeddedPlainCandidate ??
      null;
    if (winner) {
      cacheSet(key, winner);
      logger.info(
        `[lyrics] Using ${winner.source} lyrics (preferSynced=false) for: ${title} - ${artist}`
      );
      return winner;
    }
  } else {
    // preferSynced=true: embedded synced beats lrclib, so we can short-circuit.
    if (hasSynced(embedded)) {
      const winner = embedded as LyricsResult;
      cacheSet(key, winner);
      logger.info(
        `[lyrics] Using embedded synced lyrics for: ${title} - ${artist}`
      );
      return winner;
    }
  }

  // Need lrclib to complete the decision.
  const lrclib = await fetchFromLrclib(title, artist, album, duration);

  // Build ordered candidate list based on preferSynced.
  const orderedCandidates: Array<LyricsResult | null> = preferSynced
    ? [
        hasSynced(local) ? local : null,
        hasSynced(embedded) ? embedded : null,
        hasSynced(lrclib) ? lrclib : null,
        hasPlain(local) ? local : null,
        hasPlain(embedded) ? embedded : null,
        hasPlain(lrclib) ? lrclib : null,
      ]
    : [
        hasSynced(local) ? local : null,
        hasSynced(embedded) ? embedded : null,
        hasPlain(local) ? local : null,
        hasPlain(embedded) ? embedded : null,
        hasSynced(lrclib) ? lrclib : null,
        hasPlain(lrclib) ? lrclib : null,
      ];

  const winner = orderedCandidates.find((c): c is LyricsResult => c !== null);

  if (winner) {
    cacheSet(key, winner);
    logger.info(
      `[lyrics] Using ${winner.source} ${winner.synced ? 'synced' : 'plain'} lyrics for: ${title} - ${artist}`
    );
    return winner;
  }

  const empty: LyricsResult = { synced: null, plain: null, source: null };
  cacheSet(key, empty);
  return empty;
}
