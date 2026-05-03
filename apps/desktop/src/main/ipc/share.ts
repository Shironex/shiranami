import { ipcMain, net } from 'electron';
import { randomUUID } from 'crypto';
import { eq, youtubeMappings, tracks } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { createShareSchema, type CreateShareDto } from '@shiranami/contracts';
import { logger } from '../logger';
import { IpcError, SHARE_ERROR_CODES, VALIDATION_ERROR_CODES } from './errors';
import { spawnYtDlp } from '../utils/ytdlp-spawn';
import { handle } from './with-ipc-handler';
import {
  shareTrackArgs,
  sharePlaylistArgs,
  shareImportArgs,
  shareCacheYoutubeIdArgs,
} from './schemas/share';

const SHARE_API_URL =
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://api.shiranami.app';

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

async function fetchApi(
  path: string,
  options: { method: string; body?: unknown }
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = `${SHARE_API_URL}${path}`;
    const request = net.request({
      url,
      method: options.method,
    });

    request.setHeader('Content-Type', 'application/json');

    let responseData = '';
    request.on('response', response => {
      response.on('data', chunk => {
        responseData += chunk.toString();
      });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(parsed.message ?? `HTTP ${response.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          logger.warn(
            `[share] Failed to parse API response from ${path}:`,
            responseData.slice(0, 200)
          );
          reject(new Error(`Failed to parse response from ${path}`));
        }
      });
    });

    request.on('error', err => reject(err));

    if (options.body) {
      request.write(JSON.stringify(options.body));
    }
    request.end();
  });
}

export function registerShareHandlers(): void {
  // Share a single track
  handle(
    'share:track',
    async (_event, trackId: string) => {
      const db = getDatabase();
      const track = await db.select().from(tracks).where(eq(tracks.id, trackId)).get();
      if (!track) throw new IpcError(SHARE_ERROR_CODES.TRACK_NOT_FOUND, 'Track not found');
      logger.info(`[share] Sharing track: "${track.title}" by ${track.artist ?? 'Unknown Artist'}`);

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
          artist: track.artist ?? 'Unknown Artist',
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
    'share:playlist',
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

      const trackRows = [];
      for (const pt of ptRows) {
        const track = await db.select().from(tracks).where(eq(tracks.id, pt.trackId)).get();
        if (track) trackRows.push(track);
      }

      if (trackRows.length === 0)
        throw new IpcError(SHARE_ERROR_CODES.PLAYLIST_EMPTY, 'Playlist has no tracks');
      logger.info(`[share] Sharing playlist "${playlist.name}" (${trackRows.length} tracks)`);

      // Resolve YouTube IDs for all tracks
      const shareTracks = [];
      for (const track of trackRows) {
        const ytId = await getYoutubeId(track.id);
        if (ytId) {
          shareTracks.push({
            title: track.title,
            artist: track.artist ?? 'Unknown Artist',
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
    'share:import',
    async (_event, code: string) => {
      logger.info(`[share] Importing share code: ${code}`);
      const result = await fetchApi(`/api/share/${code}`, { method: 'GET' });
      return result;
    },
    { schema: shareImportArgs }
  );

  // Cache a known YouTube ID for a track (called after download from search)
  handle(
    'share:cache-youtube-id',
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
  ipcMain.removeHandler('share:track');
  ipcMain.removeHandler('share:playlist');
  ipcMain.removeHandler('share:import');
  ipcMain.removeHandler('share:cache-youtube-id');
}
