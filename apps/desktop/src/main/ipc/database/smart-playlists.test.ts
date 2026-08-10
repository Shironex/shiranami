import { join } from 'node:path';
import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDatabase, initializeDatabase } from '@shiranami/database/client';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../../test/setup';
import { registerSmartPlaylistHandlers, cleanupSmartPlaylistHandlers } from './smart-playlists';
import { registerTrackHandlers, cleanupTrackHandlers } from './tracks';
import type { SmartPlaylistRule } from '@shiranami/contracts';

describe('smart playlists ipc (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    registerTrackHandlers();
    registerSmartPlaylistHandlers();
  });

  afterEach(() => {
    cleanupSmartPlaylistHandlers();
    cleanupTrackHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  async function insertTrack(overrides: Record<string, unknown> = {}) {
    const addTrack = ipcHandlers.get('db:tracks:add')!;
    return (await addTrack(null as never, {
      filePath: `/music/${crypto.randomUUID()}.mp3`,
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 200,
      ...overrides,
    })) as { id: string };
  }

  async function preview(matchType: 'all' | 'any', rules: SmartPlaylistRule[]) {
    const handler = ipcHandlers.get('db:smart-playlists:preview')!;
    return (await handler(null as never, { matchType, rules })) as Array<{
      id: string;
      genre: string | null;
      year: number | null;
      playCount: number;
    }>;
  }

  it('filters by genre is', async () => {
    await insertTrack({ genre: 'Lofi' });
    await insertTrack({ genre: 'Rock' });

    const rows = await preview('all', [{ field: 'genre', operator: 'is', value: 'Lofi' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].genre).toBe('Lofi');
  });

  it('filters by year between (inclusive)', async () => {
    await insertTrack({ year: 1999 });
    await insertTrack({ year: 2005 });
    await insertTrack({ year: 2010 });

    const rows = await preview('all', [
      { field: 'year', operator: 'between', value: '2000', valueTo: '2008' },
    ]);
    expect(rows.map(r => r.year).sort()).toEqual([2005]);
  });

  it('filters by playCount greaterThan', async () => {
    const low = await insertTrack();
    const high = await insertTrack();
    const increment = ipcHandlers.get('db:tracks:increment-play-count')!;
    for (let i = 0; i < 6; i++) await increment(null as never, high.id);
    await increment(null as never, low.id);

    const rows = await preview('all', [
      { field: 'playCount', operator: 'greaterThan', value: '5' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(high.id);
  });

  it('combines rules with all (AND) vs any (OR)', async () => {
    await insertTrack({ genre: 'Lofi', year: 2020 });
    await insertTrack({ genre: 'Lofi', year: 2000 });
    await insertTrack({ genre: 'Jazz', year: 2020 });

    const both = await preview('all', [
      { field: 'genre', operator: 'is', value: 'Lofi' },
      { field: 'year', operator: 'greaterThan', value: '2010' },
    ]);
    expect(both).toHaveLength(1);

    const either = await preview('any', [
      { field: 'genre', operator: 'is', value: 'Jazz' },
      { field: 'year', operator: 'greaterThan', value: '2010' },
    ]);
    expect(either).toHaveLength(2);
  });

  it('treats LIKE wildcards in a contains value as literal characters', async () => {
    await insertTrack({ title: '100% Lofi' });
    await insertTrack({ title: 'Pure Jazz' });

    // Without escaping, `%` would match any sequence and return both rows.
    const rows = await preview('all', [{ field: 'title', operator: 'contains', value: '100%' }]);
    expect(rows).toHaveLength(1);
    expect(rows.map(r => (r as { title: string }).title)).toEqual(['100% Lofi']);
  });

  it('empty rule set matches the whole library', async () => {
    await insertTrack();
    await insertTrack();
    const rows = await preview('all', []);
    expect(rows).toHaveLength(2);
  });

  it('persists and re-evaluates a saved smart playlist', async () => {
    await insertTrack({ genre: 'Lofi' });
    await insertTrack({ genre: 'Rock' });

    const create = ipcHandlers.get('db:smart-playlists:create')!;
    const created = (await create(null as never, {
      name: 'Lofi only',
      matchType: 'all',
      rules: [{ field: 'genre', operator: 'is', value: 'Lofi' }],
    })) as { id: string; name: string; rules: SmartPlaylistRule[] };

    expect(created.name).toBe('Lofi only');
    expect(created.rules).toHaveLength(1);

    const getTracks = ipcHandlers.get('db:smart-playlists:get-tracks')!;
    const rows = (await getTracks(null as never, created.id)) as Array<{ genre: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].genre).toBe('Lofi');

    const getAll = ipcHandlers.get('db:smart-playlists:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(1);
  });
});
