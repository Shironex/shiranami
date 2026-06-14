import { ipcMain, net } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from '../app/logger';
import { handle } from './with-ipc-handler';
import { IpcError, PLAYLIST_ERROR_CODES } from './errors';
import { playlistExtractArgs, playlistCancelArgs } from './schemas/playlist';
import {
  spawnYtDlp,
  appendUrlArg,
  parseYtDlpJsonLines,
  ytSearch,
  type SearchResult,
} from '../utils/ytdlp-spawn';
import type { PlaylistExtractResult } from '@shiranami/contracts';
import { sendToRenderer } from '../utils/window';
import { BROWSER_USER_AGENT } from '../shared/user-agent';
import { pickBestMatch, type SpotifyTrack } from '../utils/spotify-match';

const C = IPC_CHANNELS.playlist;

export { parseYtDlpJsonLines };

type PlaylistType = 'youtube' | 'spotify' | 'unknown';

/**
 * Concurrent YouTube searches during Spotify extraction. Mirrors
 * ENRICH_CONCURRENCY (4) from the metadata-enrich pool — high enough for a
 * ~4-6x speedup over the old serial loop, low enough to stay clear of
 * YouTube search throttling and local CPU pressure from many yt-dlp processes.
 */
const MATCH_CONCURRENCY = 4;

/** Candidates fetched per track for scoring; more than 1 is what enables a real match. */
const SEARCH_LIMIT = 5;

/**
 * The current extraction's abort controller. Replaces the old module-level
 * `cancelledFlag` boolean: a real AbortController threads into `spawnYtDlp`
 * (which already honors AbortSignal) so `playlist.cancel()` actually kills
 * in-flight searches instead of merely stopping the loop from advancing.
 */
let activeExtraction: AbortController | null = null;

export function detectPlaylistType(url: string): PlaylistType {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('music.youtube.com')
    ) {
      return 'youtube';
    }

    if (host === 'open.spotify.com' && parsed.pathname.startsWith('/playlist/')) {
      return 'spotify';
    }
  } catch {
    // invalid URL
  }

  return 'unknown';
}

export function extractSpotifyPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Pull the source playlist title from yt-dlp's `--dump-json` output. Flat
 * playlist entries carry `playlist_title` (and `playlist`) on every line; read
 * it off the first parseable line so we can recreate a real playlist with the
 * source name. Returns null when absent (e.g. a single video URL).
 */
function extractYouTubePlaylistTitle(stdout: string): string | null {
  // Iterate line-by-line via indexOf rather than split('\n') to avoid
  // allocating a large array for playlists with thousands of entries — we
  // only need the first line that carries a playlist title.
  let pos = 0;
  while (pos < stdout.length) {
    const nextNewline = stdout.indexOf('\n', pos);
    const end = nextNewline === -1 ? stdout.length : nextNewline;
    const line = stdout.slice(pos, end).trim();
    pos = end + 1;

    if (!line) continue;
    try {
      const data = JSON.parse(line);
      const title = data.playlist_title ?? data.playlist;
      if (typeof title === 'string' && title.trim()) {
        return title.trim();
      }
    } catch {
      // skip malformed line
    }
  }
  return null;
}

async function extractYouTubePlaylist(url: string): Promise<PlaylistExtractResult> {
  logger.info(`[playlist] Extracting YouTube playlist: ${url}`);

  const { stdout, code } = await spawnYtDlp(
    appendUrlArg(['--flat-playlist', '--dump-json', '--no-warnings'], url)
  );

  if (code !== 0) {
    throw new IpcError(PLAYLIST_ERROR_CODES.NO_TRACKS, 'yt-dlp failed to extract playlist');
  }

  const tracks = parseYtDlpJsonLines(stdout);
  const title = extractYouTubePlaylistTitle(stdout);
  logger.info(
    `[playlist] Extracted ${tracks.length} tracks from YouTube playlist${title ? ` "${title}"` : ''}`
  );
  return { title, tracks };
}

interface SpotifyEmbedTrack {
  title?: unknown;
  name?: unknown;
  subtitle?: unknown;
  artist?: unknown;
  artists?: unknown;
  duration?: unknown;
  track?: SpotifyEmbedTrack;
}

/** A track parse counts as "real" when it has a title and a non-Unknown artist. */
function isRealTrack(track: SpotifyTrack): boolean {
  return track.title.length > 0 && track.artist !== 'Unknown';
}

/**
 * Coerce one embed track object into `SpotifyTrack`. The live embed exposes the
 * artist on `subtitle` (NOT `artists[].name`) and the duration in MILLISECONDS
 * on `duration`; convert to seconds for the scorer. Returns null for an empty
 * title. Album/ISRC are not present in the embed, so they stay omitted.
 */
function mapEmbedTrack(raw: SpotifyEmbedTrack): SpotifyTrack | null {
  const item = raw.track ?? raw;

  const title =
    typeof item.title === 'string'
      ? item.title.trim()
      : typeof item.name === 'string'
        ? item.name.trim()
        : '';
  if (!title) return null;

  let artist = '';
  if (typeof item.subtitle === 'string' && item.subtitle.trim()) {
    artist = item.subtitle.trim();
  } else if (Array.isArray(item.artists)) {
    artist = item.artists
      .map(a =>
        a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string'
          ? (a as { name: string }).name.trim()
          : ''
      )
      .filter(Boolean)
      .join(', ');
  } else if (typeof item.artist === 'string' && item.artist.trim()) {
    artist = item.artist.trim();
  }

  const durationSec =
    typeof item.duration === 'number' && item.duration > 0
      ? Math.round(item.duration / 1000)
      : undefined;

  return { title, artist: artist || 'Unknown', durationSec };
}

/**
 * Parse the Spotify embed page HTML into `SpotifyTrack[]`. The embed page is
 * the ONLY metadata source (the official Web API now requires the app owner to
 * hold Premium, so it was dropped). Tracks carry `{ title, artist, durationSec }`
 * — no album/ISRC, which the scorer treats as optional.
 *
 * Primary parse: the `__NEXT_DATA__` blob's
 * `props.pageProps.state.data.entity.trackList`, where each track exposes the
 * artist on `subtitle` and the duration in milliseconds on `duration`.
 *
 * The regex strategies are defensive secondary fallbacks that run ONLY when the
 * primary parse yields no track with a real artist — the old bug was the
 * primary parse "succeeding" with Unknown artists, which starved the better
 * fallback. We accept the primary result only when it produced at least one
 * real track; otherwise we let the fallbacks try.
 */
export function parseSpotifyEmbedHtml(html: string): SpotifyTrack[] {
  // Primary: the __NEXT_DATA__ entity.trackList.
  const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    try {
      const nextData = JSON.parse(scriptMatch[1]);
      const entity = nextData?.props?.pageProps?.state?.data?.entity;
      const items: unknown = entity?.trackList ?? entity?.tracks?.items ?? [];

      if (Array.isArray(items)) {
        const tracks: SpotifyTrack[] = [];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const mapped = mapEmbedTrack(item as SpotifyEmbedTrack);
          if (mapped) tracks.push(mapped);
        }
        // Only trust the primary parse when it produced a real artist; an
        // all-"Unknown" result means the shape shifted, so fall through.
        if (tracks.some(isRealTrack)) {
          return tracks;
        }
      }
    } catch {
      logger.warn('[playlist] Failed to parse __NEXT_DATA__ from Spotify embed');
    }
  }

  // Fallback A: a bare "trackList": [...] array anywhere in the HTML.
  // A non-greedy regex stops at the first `]`, which breaks on nested arrays
  // (e.g. `"contentRatings":{"labels":["EXPLICIT"]}`). Instead we scan by
  // bracket depth to capture the full top-level array.
  const fallbackA: SpotifyTrack[] = [];
  const trackListKey = '"trackList"';
  let searchFrom = 0;
  while (true) {
    const keyIdx = html.indexOf(trackListKey, searchFrom);
    if (keyIdx === -1) break;
    // Advance past the key, optional whitespace, colon, optional whitespace, then '['.
    let i = keyIdx + trackListKey.length;
    while (
      i < html.length &&
      (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r')
    )
      i++;
    if (html[i] !== ':') {
      searchFrom = keyIdx + 1;
      continue;
    }
    i++;
    while (
      i < html.length &&
      (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r')
    )
      i++;
    if (html[i] !== '[') {
      searchFrom = keyIdx + 1;
      continue;
    }
    const start = i;
    let depth = 0;
    while (i < html.length) {
      if (html[i] === '[') depth++;
      else if (html[i] === ']') {
        depth--;
        if (depth === 0) break;
      } else if (html[i] === '"') {
        i++;
        while (i < html.length && html[i] !== '"') {
          if (html[i] === '\\') i++;
          i++;
        }
      }
      i++;
    }
    const end = i + 1;
    searchFrom = end;
    try {
      const trackList = JSON.parse(html.slice(start, end));
      if (!Array.isArray(trackList)) continue;
      for (const item of trackList) {
        if (!item || typeof item !== 'object') continue;
        const mapped = mapEmbedTrack(item as SpotifyEmbedTrack);
        if (mapped) fallbackA.push(mapped);
      }
    } catch {
      continue;
    }
  }
  if (fallbackA.some(isRealTrack)) {
    return fallbackA;
  }

  // Fallback B: scan script bodies for title + artists[].name pairs.
  const fallbackB: SpotifyTrack[] = [];
  for (const scriptBlock of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    const content = scriptBlock[1];
    const trackPattern = /"title"\s*:\s*"([^"]+)"[\s\S]*?"artists"\s*:\s*\[([\s\S]*?)\]/g;
    let trackMatch: RegExpExecArray | null;
    while ((trackMatch = trackPattern.exec(content)) !== null) {
      const title = trackMatch[1].trim();
      if (!title) continue;
      const artistNameMatch = trackMatch[2].match(/"name"\s*:\s*"([^"]+)"/);
      const artist = artistNameMatch?.[1]?.trim() || 'Unknown';
      fallbackB.push({ title, artist });
    }
  }

  // Prefer fallbackB when it has real tracks — fallbackA at this point has
  // no real (non-"Unknown") artists (already checked above), so discarding it
  // in favour of real-track fallbackB is always correct.
  if (fallbackB.some(isRealTrack)) {
    return fallbackB;
  }
  // No fallback produced real tracks; return any parsed tracks (A preferred), else empty.
  return fallbackA.length > 0 ? fallbackA : fallbackB;
}

/**
 * Fetch and parse the Spotify embed page — the ONLY Spotify metadata source.
 * No auth, no app, no Premium. Yields `{ title, artist, durationSec }` and is
 * capped at ~100 tracks by Spotify's embed render limit.
 */
/**
 * Pull the Spotify playlist name from the embed page's `__NEXT_DATA__` blob
 * (`entity.name` / `entity.title`). Returns null when absent.
 */
export function parseSpotifyPlaylistName(html: string): string | null {
  const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return null;
  try {
    const nextData = JSON.parse(scriptMatch[1]);
    const entity = nextData?.props?.pageProps?.state?.data?.entity;
    const name = entity?.name ?? entity?.title;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

async function fetchSpotifyEmbedTracks(
  playlistId: string
): Promise<{ name: string | null; tracks: SpotifyTrack[] }> {
  logger.info(`[playlist] Fetching Spotify embed page for playlist: ${playlistId}`);

  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const response = await net.fetch(embedUrl, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new IpcError(
      PLAYLIST_ERROR_CODES.PRIVATE_PLAYLIST,
      `Failed to fetch Spotify embed page: ${response.status}`
    );
  }

  const html = await response.text();
  const tracks = parseSpotifyEmbedHtml(html);
  const name = parseSpotifyPlaylistName(html);
  logger.info(`[playlist] Extracted ${tracks.length} tracks from Spotify embed`);
  return { name, tracks };
}

/**
 * Match one Spotify track to its best YouTube candidate: fetch SEARCH_LIMIT
 * candidates and score them (duration window + title/artist similarity +
 * forbidden-word penalty + Topic/view tiebreak) instead of taking results[0].
 * The chosen candidate carries the match confidence + flag so the renderer can
 * warn on shaky matches. Returns null only when the search yields nothing.
 */
async function matchSpotifyTrackOnYouTube(
  track: SpotifyTrack,
  signal: AbortSignal
): Promise<SearchResult | null> {
  const query = `${track.artist} - ${track.title}`;

  try {
    const candidates = await ytSearch(query, { limit: SEARCH_LIMIT, signal });
    const { result, confidence, flag } = pickBestMatch(track, candidates);
    if (!result) return null;
    return { ...result, matchConfidence: Number(confidence.toFixed(3)), matchFlag: flag };
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw err;
    }
    logger.warn(`[playlist] Failed to match Spotify track "${query}" on YouTube:`, err);
    return null;
  }
}

/**
 * Extract a Spotify playlist into scored YouTube `SearchResult`s. Metadata is
 * scraped from the public embed page (the only source), then each track is
 * matched through a bounded concurrent pool (shared cursor + index slotting
 * preserves order), mirroring the proven `runEnrichmentBatch` shape.
 * Cancellation is a real AbortController threaded into the searches.
 */
async function extractSpotifyPlaylist(
  url: string,
  signal: AbortSignal
): Promise<PlaylistExtractResult> {
  const playlistId = extractSpotifyPlaylistId(url);
  if (!playlistId) {
    throw new IpcError(PLAYLIST_ERROR_CODES.UNSUPPORTED_URL, 'Invalid Spotify playlist URL');
  }

  const { name: playlistName, tracks: spotifyTracks } = await fetchSpotifyEmbedTracks(playlistId);
  if (spotifyTracks.length === 0) {
    throw new IpcError(
      PLAYLIST_ERROR_CODES.NO_TRACKS,
      'Could not extract tracks from Spotify playlist. The playlist may be private or empty.'
    );
  }

  const total = spotifyTracks.length;
  // Slot by input index so the returned list preserves playlist order even
  // though tasks finish out of order.
  const slots: (SearchResult | null)[] = new Array(total).fill(null);

  let completed = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal.aborted) return;

      const i = nextIndex++;
      if (i >= total) return;
      const track = spotifyTracks[i];

      sendToRenderer(C.extractProgress, {
        current: Math.min(completed + 1, total),
        total,
        trackName: `${track.artist} - ${track.title}`,
      });

      try {
        slots[i] = await matchSpotifyTrackOnYouTube(track, signal);
      } catch (err) {
        if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        logger.warn(`[playlist] Match failed for "${track.title}":`, err);
        slots[i] = null;
      }

      completed += 1;
      sendToRenderer(C.extractProgress, {
        current: Math.min(completed, total),
        total,
        trackName: `${track.artist} - ${track.title}`,
      });
    }
  }

  const poolSize = Math.max(1, Math.min(MATCH_CONCURRENCY, total));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  const results = slots.filter((r): r is SearchResult => r !== null);
  const lowConfidence = results.filter(r => r.matchFlag === 'low').length;
  logger.info(
    `[playlist] Resolved ${results.length}/${total} Spotify tracks on YouTube` +
      `${lowConfidence > 0 ? ` (${lowConfidence} low-confidence)` : ''}` +
      `${signal.aborted ? ' (cancelled)' : ''}`
  );
  return { title: playlistName, tracks: results };
}

export function registerPlaylistHandlers(): void {
  handle(
    C.extract,
    async (_event, url: string) => {
      const playlistType = detectPlaylistType(url);

      if (playlistType === 'unknown') {
        throw new IpcError(
          PLAYLIST_ERROR_CODES.UNSUPPORTED_URL,
          'Unsupported URL. Please provide a YouTube or Spotify playlist URL.'
        );
      }

      if (playlistType === 'youtube') {
        return await extractYouTubePlaylist(url);
      }

      // Abort any prior run still in flight, then start a fresh controller.
      activeExtraction?.abort();
      const controller = new AbortController();
      activeExtraction = controller;
      try {
        return await extractSpotifyPlaylist(url, controller.signal);
      } finally {
        if (activeExtraction === controller) {
          activeExtraction = null;
        }
      }
    },
    { schema: playlistExtractArgs }
  );

  handle(
    C.cancel,
    async () => {
      activeExtraction?.abort();
      logger.info('[playlist] Extraction cancelled');
    },
    { schema: playlistCancelArgs }
  );
}

export function cleanupPlaylistHandlers(): void {
  ipcMain.removeHandler(C.extract);
  ipcMain.removeHandler(C.cancel);
}
