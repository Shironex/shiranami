import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDatabase, initializeDatabase } from '@shiranami/database/client';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../test/setup';
import { cleanupRadioHandlers, registerRadioHandlers } from './radio';

describe('radio ipc (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
    registerRadioHandlers();
  });

  afterEach(() => {
    cleanupRadioHandlers();
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  function makeStation(overrides: Record<string, unknown> = {}) {
    return {
      stationUuid: crypto.randomUUID(),
      name: 'Test Radio',
      url: 'http://stream.example.com/radio',
      urlResolved: 'http://stream.example.com/radio',
      homepage: 'http://example.com',
      country: 'US',
      countryCode: 'US',
      codec: 'MP3',
      bitrate: 128,
      ...overrides,
    };
  }

  it('radio:favorites:add inserts a station and returns it', async () => {
    const add = ipcHandlers.get('radio:favorites:add')!;
    const station = makeStation({ name: 'Jazz FM' });
    const result = (await add(null as never, station)) as {
      id: string;
      stationUuid: string;
      name: string;
    };

    expect(result.id).toBeDefined();
    expect(result.stationUuid).toBe(station.stationUuid);
    expect(result.name).toBe('Jazz FM');
  });

  it('radio:favorites:is-favorite returns true for saved station and false for unknown', async () => {
    const add = ipcHandlers.get('radio:favorites:add')!;
    const station = makeStation();
    await add(null as never, station);

    const isFavorite = ipcHandlers.get('radio:favorites:is-favorite')!;
    expect(await isFavorite(null as never, station.stationUuid)).toBe(true);
    // Valid-shape UUID that isn't in the DB — zod only rejects malformed shapes,
    // so a well-formed UUID that doesn't match a row should return false.
    expect(await isFavorite(null as never, '00000000-0000-4000-8000-000000000000')).toBe(false);
  });

  it('radio:favorites:get-all returns all saved stations', async () => {
    const add = ipcHandlers.get('radio:favorites:add')!;
    await add(null as never, makeStation({ name: 'Station A' }));
    await add(null as never, makeStation({ name: 'Station B' }));

    const getAll = ipcHandlers.get('radio:favorites:get-all')!;
    const all = (await getAll(null as never)) as Array<{ name: string }>;
    expect(all).toHaveLength(2);
  });

  it('radio:favorites:remove deletes a station by stationUuid', async () => {
    const add = ipcHandlers.get('radio:favorites:add')!;
    const station = makeStation();
    await add(null as never, station);

    const remove = ipcHandlers.get('radio:favorites:remove')!;
    await remove(null as never, station.stationUuid);

    const isFavorite = ipcHandlers.get('radio:favorites:is-favorite')!;
    expect(await isFavorite(null as never, station.stationUuid)).toBe(false);

    const getAll = ipcHandlers.get('radio:favorites:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(0);
  });
});
