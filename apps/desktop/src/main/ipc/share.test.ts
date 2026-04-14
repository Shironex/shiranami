import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { closeDatabase, initializeDatabase, getDatabase } from '@shiranami/database/client';
import {
  tracks,
  playlists,
  playlistTracks,
  youtubeMappings,
  eq,
} from '@shiranami/database';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../test/setup';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockSpawnYtDlp = vi.fn();
vi.mock('../utils/ytdlp-spawn', () => ({
  spawnYtDlp: (...args: unknown[]) => mockSpawnYtDlp(...args),
}));

/* ---------------------------------------------------------------- */
/*  electron.net.request stub — simulates the share API.            */
/* ---------------------------------------------------------------- */

type FakeApiResponse = {
  statusCode?: number;
  body?: unknown;
};

let apiResponse: FakeApiResponse = { statusCode: 200, body: { url: 'https://share.test/abc' } };
const apiCalls: Array<{ url: string; method: string; body?: unknown }> = [];

vi.mock('electron', async () => {
  const setup = await import('../../../test/setup');
  return {
    ipcMain: {
      handle(channel: string, fn: (...args: unknown[]) => unknown) {
        setup.ipcHandlers.set(channel, fn);
      },
      on(channel: string, listener: (...args: unknown[]) => void) {
        if (!setup.ipcOnListeners.has(channel)) {
          setup.ipcOnListeners.set(channel, new Set());
        }
        setup.ipcOnListeners.get(channel)!.add(listener);
      },
      removeHandler(channel: string) {
        setup.ipcHandlers.delete(channel);
      },
      removeAllListeners(channel: string) {
        setup.ipcOnListeners.delete(channel);
      },
    },
    BrowserWindow: class {
      static getFocusedWindow() { return null; }
      static getAllWindows() { return []; }
    },
    app: {
      isPackaged: false,
      getPath: vi.fn().mockReturnValue('/mock/userData'),
      getAppPath: vi.fn().mockReturnValue('/mock/app'),
    },
    net: {
      request: vi.fn((opts: { url: string; method: string }) => {
        const handlers: Record<string, (...args: unknown[]) => void> = {};
        let writtenBody: string | undefined;
        return {
          setHeader: vi.fn(),
          on(event: string, cb: (...args: unknown[]) => void) {
            handlers[event] = cb;
          },
          write(chunk: string) {
            writtenBody = chunk;
          },
          end() {
            apiCalls.push({
              url: opts.url,
              method: opts.method,
              body: writtenBody ? JSON.parse(writtenBody) : undefined,
            });
            // Simulate async response
            setImmediate(() => {
              const responseHandlers: Record<string, (...args: unknown[]) => void> = {};
              handlers['response']?.({
                statusCode: apiResponse.statusCode ?? 200,
                on(event: string, cb: (...args: unknown[]) => void) {
                  responseHandlers[event] = cb;
                },
              });
              responseHandlers['data']?.(Buffer.from(JSON.stringify(apiResponse.body ?? {})));
              responseHandlers['end']?.();
            });
          },
        };
      }),
    },
  };
});

import { registerShareHandlers, cleanupShareHandlers } from './share';

/* ---------------------------------------------------------------- */
/*  Test DB helpers                                                  */
/* ---------------------------------------------------------------- */

function insertTrack(overrides: Record<string, unknown> = {}): string {
  const db = getDatabase();
  const id = crypto.randomUUID();
  db.insert(tracks)
    .values({
      id,
      filePath: `/music/${id}.mp3`,
      title: 'Test Title',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 200,
      ...overrides,
    })
    .run();
  return id;
}

function insertYoutubeMapping(trackId: string, youtubeId: string): void {
  const db = getDatabase();
  db.insert(youtubeMappings)
    .values({ id: crypto.randomUUID(), trackId, youtubeId })
    .run();
}

function insertPlaylist(name: string): string {
  const db = getDatabase();
  const id = crypto.randomUUID();
  db.insert(playlists).values({ id, name }).run();
  return id;
}

function addTrackToPlaylist(playlistId: string, trackId: string, position: number): void {
  const db = getDatabase();
  db.insert(playlistTracks)
    .values({ id: crypto.randomUUID(), playlistId, trackId, position })
    .run();
}

/* ---------------------------------------------------------------- */

describe('share ipc handlers', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    apiCalls.length = 0;
    apiResponse = { statusCode: 200, body: { url: 'https://share.test/abc' } };
    mockSpawnYtDlp.mockReset();
    registerShareHandlers();
  });

  afterEach(() => {
    cleanupShareHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  describe('share:track', () => {
    it('uses cached YouTube ID when mapping exists', async () => {
      const trackId = insertTrack({ title: 'Cached Song' });
      insertYoutubeMapping(trackId, 'cachedYtId');

      const handler = ipcHandlers.get('share:track')!;
      const result = await handler(null as never, trackId);

      expect(result).toEqual({ url: 'https://share.test/abc' });
      expect(mockSpawnYtDlp).not.toHaveBeenCalled();
      expect(apiCalls).toHaveLength(1);
      expect(apiCalls[0].body).toMatchObject({
        type: 'TRACK',
        payload: { title: 'Cached Song', ytId: 'cachedYtId' },
      });
    });

    it('looks up YouTube via yt-dlp when no cached mapping', async () => {
      const trackId = insertTrack({ title: 'Fresh Song', artist: 'Band' });
      mockSpawnYtDlp.mockResolvedValue({
        stdout: JSON.stringify({ id: 'fetchedYtId', title: 'Fresh Song' }),
        stderr: '',
        code: 0,
      });

      const handler = ipcHandlers.get('share:track')!;
      await handler(null as never, trackId);

      expect(mockSpawnYtDlp).toHaveBeenCalledTimes(1);
      expect(apiCalls[0].body).toMatchObject({
        type: 'TRACK',
        payload: { ytId: 'fetchedYtId' },
      });

      // Mapping should have been cached
      const db = getDatabase();
      const cached = db
        .select()
        .from(youtubeMappings)
        .where(eq(youtubeMappings.trackId, trackId))
        .get();
      expect(cached?.youtubeId).toBe('fetchedYtId');
    });

    it('throws NO_YOUTUBE_MATCH when yt-dlp search fails', async () => {
      const trackId = insertTrack();
      mockSpawnYtDlp.mockResolvedValue({ stdout: '', stderr: 'nope', code: 1 });

      const handler = ipcHandlers.get('share:track')!;
      await expect(handler(null as never, trackId)).rejects.toMatchObject({
        code: 'share.no_youtube_match',
      });
    });

    it('throws TRACK_NOT_FOUND when track does not exist', async () => {
      const handler = ipcHandlers.get('share:track')!;
      await expect(handler(null as never, 'nonexistent')).rejects.toMatchObject({
        code: 'share.track_not_found',
      });
    });
  });

  describe('share:playlist', () => {
    it('returns share URL for a playlist where all tracks resolve', async () => {
      const playlistId = insertPlaylist('My Mix');
      const t1 = insertTrack({ title: 'T1' });
      const t2 = insertTrack({ title: 'T2' });
      insertYoutubeMapping(t1, 'yt1');
      insertYoutubeMapping(t2, 'yt2');
      addTrackToPlaylist(playlistId, t1, 0);
      addTrackToPlaylist(playlistId, t2, 1);

      const handler = ipcHandlers.get('share:playlist')!;
      const result = await handler(null as never, playlistId);

      expect(result).toEqual({ url: 'https://share.test/abc' });
      expect(apiCalls[0].body).toMatchObject({
        type: 'PLAYLIST',
        payload: {
          name: 'My Mix',
          tracks: [
            expect.objectContaining({ title: 'T1', ytId: 'yt1' }),
            expect.objectContaining({ title: 'T2', ytId: 'yt2' }),
          ],
        },
      });
    });

    it('throws PLAYLIST_NOT_FOUND for missing playlist', async () => {
      const handler = ipcHandlers.get('share:playlist')!;
      await expect(handler(null as never, 'missing')).rejects.toMatchObject({
        code: 'share.playlist_not_found',
      });
    });

    it('throws PLAYLIST_EMPTY when playlist has no tracks', async () => {
      const playlistId = insertPlaylist('Empty');
      const handler = ipcHandlers.get('share:playlist')!;
      await expect(handler(null as never, playlistId)).rejects.toMatchObject({
        code: 'share.playlist_empty',
      });
    });

    it('throws NO_MATCHES_FOR_ANY_TRACK when no track resolves on YouTube', async () => {
      const playlistId = insertPlaylist('No Matches');
      const t1 = insertTrack({ title: 'Unknown' });
      addTrackToPlaylist(playlistId, t1, 0);
      mockSpawnYtDlp.mockResolvedValue({ stdout: '', stderr: '', code: 1 });

      const handler = ipcHandlers.get('share:playlist')!;
      await expect(handler(null as never, playlistId)).rejects.toMatchObject({
        code: 'share.no_matches_for_any_track',
      });
    });
  });

  describe('share:import', () => {
    it('fetches shared payload by code and returns parsed JSON', async () => {
      apiResponse = { statusCode: 200, body: { type: 'TRACK', payload: { title: 'Shared' } } };

      const handler = ipcHandlers.get('share:import')!;
      const result = await handler(null as never, 'abc123');

      expect(result).toEqual({ type: 'TRACK', payload: { title: 'Shared' } });
      expect(apiCalls[0].url).toMatch(/\/api\/share\/abc123$/);
      expect(apiCalls[0].method).toBe('GET');
    });

    it('rejects when API returns an error status', async () => {
      apiResponse = { statusCode: 404, body: { message: 'not found' } };

      const handler = ipcHandlers.get('share:import')!;
      await expect(handler(null as never, 'missing')).rejects.toThrow('not found');
    });
  });

  describe('share:cache-youtube-id', () => {
    it('inserts a new YouTube mapping for a track', async () => {
      const trackId = insertTrack();
      const handler = ipcHandlers.get('share:cache-youtube-id')!;
      await handler(null as never, trackId, 'newYtId');

      const db = getDatabase();
      const cached = db
        .select()
        .from(youtubeMappings)
        .where(eq(youtubeMappings.trackId, trackId))
        .get();
      expect(cached?.youtubeId).toBe('newYtId');
    });

    it('updates existing mapping when one already exists', async () => {
      const trackId = insertTrack();
      insertYoutubeMapping(trackId, 'oldYtId');

      const handler = ipcHandlers.get('share:cache-youtube-id')!;
      await handler(null as never, trackId, 'updatedYtId');

      const db = getDatabase();
      const cached = db
        .select()
        .from(youtubeMappings)
        .where(eq(youtubeMappings.trackId, trackId))
        .get();
      expect(cached?.youtubeId).toBe('updatedYtId');
    });
  });

  it('cleanupShareHandlers removes all registered handlers', () => {
    expect(ipcHandlers.has('share:track')).toBe(true);
    expect(ipcHandlers.has('share:playlist')).toBe(true);
    expect(ipcHandlers.has('share:import')).toBe(true);
    expect(ipcHandlers.has('share:cache-youtube-id')).toBe(true);

    cleanupShareHandlers();

    expect(ipcHandlers.has('share:track')).toBe(false);
    expect(ipcHandlers.has('share:playlist')).toBe(false);
    expect(ipcHandlers.has('share:import')).toBe(false);
    expect(ipcHandlers.has('share:cache-youtube-id')).toBe(false);
  });
});
