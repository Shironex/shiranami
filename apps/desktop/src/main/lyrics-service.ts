import { logger } from './logger';

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  synced: LyricLine[] | null; // Timestamped lyrics
  plain: string | null; // Plain text lyrics
  source: 'lrclib' | 'cache' | null;
}

// In-memory cache for current session
const lyricsCache = new Map<string, LyricsResult>();

function getCacheKey(title: string, artist: string): string {
  return `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
}

/**
 * Parse LRC format string into array of timed lyric lines.
 * Format: [mm:ss.xx]Lyric text
 */
function parseLrc(lrc: string): LyricLine[] {
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
 * Fetch lyrics for a track from LRCLIB.
 * Returns synced (timestamped) lyrics if available, otherwise plain text.
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsResult> {
  const key = getCacheKey(title, artist);

  // Check memory cache
  const cached = lyricsCache.get(key);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  try {
    // Dynamic import since lrclib-api may have ESM internals
    const { Client } = require('lrclib-api');
    const client = new Client();

    const query: Record<string, string | number> = {
      track_name: title,
      artist_name: artist,
    };
    if (album && album !== 'Unknown Album') {
      query.album_name = album;
    }
    if (duration && duration > 0) {
      query.duration = Math.round(duration);
    }

    logger.debug(`[lyrics] Fetching lyrics for: ${title} - ${artist}`);

    const result = await client.get(query);

    if (!result) {
      // Try search as fallback
      const searchResults = await client.search({ q: `${title} ${artist}` });
      if (searchResults && searchResults.length > 0) {
        const best = searchResults[0];
        const lyricsResult: LyricsResult = {
          synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
          plain: best.plainLyrics || null,
          source: 'lrclib',
        };
        lyricsCache.set(key, lyricsResult);
        logger.info(
          `[lyrics] Found lyrics via search for: ${title} - ${artist}`
        );
        return lyricsResult;
      }

      logger.debug(`[lyrics] No lyrics found for: ${title} - ${artist}`);
      const empty: LyricsResult = { synced: null, plain: null, source: null };
      lyricsCache.set(key, empty);
      return empty;
    }

    const lyricsResult: LyricsResult = {
      synced: result.syncedLyrics ? parseLrc(result.syncedLyrics) : null,
      plain: result.plainLyrics || null,
      source: 'lrclib',
    };

    lyricsCache.set(key, lyricsResult);
    logger.info(
      `[lyrics] Found ${lyricsResult.synced ? 'synced' : 'plain'} lyrics for: ${title} - ${artist}`
    );
    return lyricsResult;
  } catch (error) {
    logger.warn(
      `[lyrics] Failed to fetch lyrics for: ${title} - ${artist}`,
      error
    );
    return { synced: null, plain: null, source: null };
  }
}
