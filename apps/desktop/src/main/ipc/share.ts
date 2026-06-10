import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { eq, inArray, youtubeMappings, tracks, type Track } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import {
  createShareSchema,
  shareImportResponseSchema,
  IPC_CHANNELS,
  type CreateShareDto,
} from '@shiranami/contracts';
import { UNKNOWN_ARTIST, chunk } from '@shiranami/shared';
import { logger } from '../logger';
import { HttpError, requestJson } from '../http';
import { IpcError, SHARE_ERROR_CODES, VALIDATION_ERROR_CODES } from './errors';
import { spawnYtDlp } from '../utils/ytdlp-spawn';
import { handle } from './with-ipc-handler';
import {
  shareTrackArgs,
  sharePlaylistArgs,
  shareImportArgs,
  shareCacheYoutubeIdArgs,
} from './schemas/share';

const C = IPC_CHANNELS.share;

// Bulk inArray reads are chunked to stay well under SQLite's bound-parameter
// limit on pathological playlists (consistent with the other bulk call sites
// in ipc/database/*).
const CHUNK_SIZE = 500;

const SHARE_API_URL =
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://api.shiranami.app';

/**
 * Read every cached track→youtubeId mapping for the given ids in one query.
 * Lets bulk callers (playlist share) resolve cache hits without N per-track
 * SELECTs; only cache misses fall through to the per-track yt-dlp search.
 */
function getCachedYoutubeIds(trackIds: string[]): Map<string, string> {
  if (trackIds.length === 0) return new Map();
  const db = getDatabase();
  const cached = new Map<string, string>();
  for (const batch of chunk(trackIds, CHUNK_SIZE)) {
    const rows = db
      .select({ trackId: youtubeMappings.trackId, youtubeId: youtubeMappings.youtubeId })
      .from(youtubeMappings)
      .where(inArray(youtubeMappings.trackId, batch))
      .all();
    for (const r of rows) cached.set(r.trackId, r.youtubeId);
  }
  return cached;
}

async function getYoutubeId(trackId: string): Promise<string | null> {
  const db = getDatabase();

  // Check cache first
  const cached = await db
    .select()
    .from(youtubeMappings)
    .where(eq(youtubeMappings.trackId, trackId))
    .get();
  if (cached) {
    logger.debug(`[share] YouTube ID cache hit for track ${trackId}`);
    return cached.youtubeId;
  }

  // Look up track info
  const track = await db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!track) return null;

  // Search YouTube
  try {
    const query = `${track.title} ${track.artist ?? ''}`.trim();
    const { stdout, code } = await spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch1:${query}`,
    ]);

    if (code !== 0 || !stdout.trim()) return null;

    const data = JSON.parse(stdout.trim().split('\n')[0]);
    const youtubeId = data.id;
    if (!youtubeId) return null;

    // Cache the mapping
    await db
      .insert(youtubeMappings)
      .values({
        id: randomUUID(),
        trackId,
        youtubeId,
      })
      .onConflictDoUpdate({
        target: youtubeMappings.trackId,
        set: { youtubeId, searchedAt: new Date().toISOString() },
      });

    return youtubeId;
  } catch (err) {
    logger.error('[share] YouTube search failed:', err);
    return null;
  }
}

/**
 * Validates an outbound share body against the contracts schema before we
 * issue the HTTP call. Catches drift between desktop and the server's
 * `createShareSchema`: if our body shape ever falls out of sync, we surface a
 * structured BAD_REQUEST locally instead of letting the server reject it
 * with a less actionable error.
 */
function assertShareBody(body: CreateShareDto): CreateShareDto {
  const parsed = createShareSchema.safeParse(body);
  if (!parsed.success) {
    logger.error('[share] outbound body failed contracts validation', parsed.error.issues);
    throw new IpcError(
      VALIDATION_ERROR_CODES.BAD_REQUEST,
      'Outbound share request failed contract validation',
      parsed.error.issues
    );
  }
  return parsed.data;
}

/**
 * Issue a JSON request against the share API via the shared `requestJson`
 * helper. `readErrorBody` lets us preserve the previous behavior of surfacing
 * the server's `message` field on a 4xx/5xx instead of the generic status text;
 * unparseable bodies fall back to a `Failed to parse response` error.
 */
async function fetchApi(
  path: string,
  options: { method: string; body?: unknown }
): Promise<unknown> {
  const url = `${SHARE_API_URL}${path}`;
  try {
    return await requestJson<unknown>(url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      readErrorBody: true,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      let message: string | undefined;
      try {
        message = (JSON.parse(err.bodyText ?? '') as { message?: string }).message;
      } catch {
        // Non-JSON error body — fall back to the status-based message below.
      }
      throw new Error(message ?? `HTTP ${err.status}`, { cause: err });
    }
    if (err instanceof SyntaxError) {
      logger.warn(`[share] Failed to parse API response from ${path}`);
      throw new Error(`Failed to parse response from ${path}`, { cause: err });
    }
    throw err;
  }
}

export function registerShareHandlers(): void {
  // Share a single track
  handle(
    C.track,
    async (_event, trackId: string) => {
      const db = getDatabase();
      const track = await db.select().from(tracks).where(eq(tracks.id, trackId)).get();
      if (!track) throw new IpcError(SHARE_ERROR_CODES.TRACK_NOT_FOUND, 'Track not found');
      logger.info(`[share] Sharing track: "${track.title}" by ${track.artist ?? UNKNOWN_ARTIST}`);

      const ytId = await getYoutubeId(trackId);
      if (!ytId)
        throw new IpcError(
          SHARE_ERROR_CODES.NO_YOUTUBE_MATCH,
          'Could not find YouTube match for this track'
        );

      const body = assertShareBody({
        type: 'TRACK',
        payload: {
          title: track.title,
          artist: track.artist ?? UNKNOWN_ARTIST,
          ytId,
        },
      });

      const result = await fetchApi('/api/share', { method: 'POST', body });

      return result;
    },
    { schema: shareTrackArgs }
  );

  // Share a playlist
  handle(
    C.playlist,
    async (_event, playlistId: string) => {
      const db = getDatabase();

      // Get playlist info
      const { playlists } = await import('@shiranami/database');
      const playlist = await db.select().from(playlists).where(eq(playlists.id, playlistId)).get();
      if (!playlist) throw new IpcError(SHARE_ERROR_CODES.PLAYLIST_NOT_FOUND, 'Playlist not found');

      // Get playlist tracks
      const { playlistTracks } = await import('@shiranami/database');
      const ptRows = await db
        .select()
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId))
        .orderBy(playlistTracks.position)
        .all();

      // Fetch all playlist tracks in chunked bulk queries, then reorder in JS
      // to match the playlist's position order (inArray returns rows
      // unordered, and chunking discards any cross-chunk ordering anyway).
      const orderedTrackIds = ptRows.map(pt => pt.trackId);
      const trackById = new Map<string, Track>();
      for (const batch of chunk(orderedTrackIds, CHUNK_SIZE)) {
        const rows = db.select().from(tracks).where(inArray(tracks.id, batch)).all();
        for (const row of rows) trackById.set(row.id, row);
      }
      const trackRows = orderedTrackIds
        .map(id => trackById.get(id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined);

      if (trackRows.length === 0)
        throw new IpcError(SHARE_ERROR_CODES.PLAYLIST_EMPTY, 'Playlist has no tracks');
      logger.info(`[share] Sharing playlist "${playlist.name}" (${trackRows.length} tracks)`);

      // Pre-resolve cached YouTube IDs in one query so the common case (an
      // already-shared playlist) skips the per-track cache SELECT. Cache
      // misses still fall through to getYoutubeId's per-track yt-dlp search,
      // which is an unavoidable network op.
      const cachedYtIds = getCachedYoutubeIds(trackRows.map(t => t.id));
      const shareTracks = [];
      for (const track of trackRows) {
        const ytId = cachedYtIds.get(track.id) ?? (await getYoutubeId(track.id));
        if (ytId) {
          shareTracks.push({
            title: track.title,
            artist: track.artist ?? UNKNOWN_ARTIST,
            ytId,
          });
        }
      }

      logger.info(
        `[share] Playlist "${playlist.name}": ${shareTracks.length}/${trackRows.length} tracks matched on YouTube`
      );
      if (shareTracks.length === 0)
        throw new IpcError(
          SHARE_ERROR_CODES.NO_MATCHES_FOR_ANY_TRACK,
          'Could not find YouTube matches for any tracks'
        );

      const body = assertShareBody({
        type: 'PLAYLIST',
        payload: {
          name: playlist.name,
          tracks: shareTracks,
        },
      });

      const result = await fetchApi('/api/share', { method: 'POST', body });

      return result;
    },
    { schema: sharePlaylistArgs }
  );

  // Import shared content (fetch share data by code)
  handle(
    C.import,
    async (_event, code: string) => {
      logger.info(`[share] Importing share code: ${code}`);
      const result = await fetchApi(`/api/share/${code}`, { method: 'GET' });
      // Validate the remote response before handing it to the renderer: this is
      // untrusted network input, and the renderer reads payload fields directly.
      const parsed = shareImportResponseSchema.safeParse(result);
      if (!parsed.success) {
        logger.warn('[share] Import response failed schema validation', parsed.error.format());
        throw new IpcError(
          SHARE_ERROR_CODES.INVALID_RESPONSE,
          'Received invalid share data from the server'
        );
      }
      return parsed.data;
    },
    { schema: shareImportArgs }
  );

  // Cache a known YouTube ID for a track (called after download from search)
  handle(
    C.cacheYoutubeId,
    async (_event, trackId: string, youtubeId: string) => {
      const db = getDatabase();
      await db
        .insert(youtubeMappings)
        .values({
          id: randomUUID(),
          trackId,
          youtubeId,
        })
        .onConflictDoUpdate({
          target: youtubeMappings.trackId,
          set: { youtubeId, searchedAt: new Date().toISOString() },
        });
    },
    { schema: shareCacheYoutubeIdArgs }
  );
}

export function cleanupShareHandlers(): void {
  ipcMain.removeHandler(C.track);
  ipcMain.removeHandler(C.playlist);
  ipcMain.removeHandler(C.import);
  ipcMain.removeHandler(C.cacheYoutubeId);
}
