import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDatabase, initializeDatabase } from '@shiranami/database';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../test/setup';
import { cleanupDatabaseHandlers, registerDatabaseHandlers } from './database';

describe('database ipc (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    registerDatabaseHandlers();
  });

  afterEach(() => {
    cleanupDatabaseHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  it('record-play, get-recent, get-summary, and get-activity against a temp db', async () => {
    const addTrack = ipcHandlers.get('db:tracks:add')!;
    const track = (await addTrack(null as never, {
      filePath: '/music/test-track.mp3',
      title: 'Integration Track',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 200,
    })) as { id: string };

    const recordPlay = ipcHandlers.get('db:history:record-play')!;
    await recordPlay(null as never, {
      trackId: track.id,
      playedSeconds: 180,
      duration: 200,
      source: 'library',
    });

    const getRecent = ipcHandlers.get('db:history:get-recent')!;
    const recent = (await getRecent(null as never, { limit: 10 })) as Array<{ trackId: string; title: string }>;
    expect(recent).toHaveLength(1);
    expect(recent[0]!.trackId).toBe(track.id);
    expect(recent[0]!.title).toBe('Integration Track');

    const getSummary = ipcHandlers.get('db:history:get-summary')!;
    const summary = (await getSummary(null as never, {})) as {
      totalPlays: number;
      uniqueTracks: number;
      topTracks: Array<{ trackId: string }>;
    };
    expect(summary.totalPlays).toBe(1);
    expect(summary.uniqueTracks).toBe(1);
    expect(summary.topTracks.some((r) => r.trackId === track.id)).toBe(true);

    const getActivity = ipcHandlers.get('db:history:get-activity')!;
    const activity = (await getActivity(null as never, {})) as Array<{ playCount: number }>;
    expect(activity.length).toBeGreaterThanOrEqual(1);
    expect(activity.some((a) => a.playCount >= 1)).toBe(true);
  });
});
