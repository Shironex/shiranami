import { join } from 'node:path';
import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@shiranami/database/client';
import { playHistory, smartPlaylists, tracks, eq, sql } from '@shiranami/database';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../../test/setup';
import { registerSmartPlaylistHandlers, cleanupSmartPlaylistHandlers } from './smart-playlists';
import { registerTrackHandlers, cleanupTrackHandlers } from './tracks';
import type {
  SmartPlaylistDefinition,
  SmartPlaylistOrderBy,
  SmartPlaylistRule,
} from '@shiranami/contracts';

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

  type PreviewRow = {
    id: string;
    title: string;
    genre: string | null;
    year: number | null;
    duration: number | null;
    loudnessLufs: number | null;
    playCount: number;
  };

  async function evaluate(definition: SmartPlaylistDefinition) {
    const handler = ipcHandlers.get('db:smart-playlists:preview')!;
    return (await handler(null as never, definition)) as PreviewRow[];
  }

  async function preview(
    matchType: 'all' | 'any',
    rules: SmartPlaylistRule[],
    extra: { limit?: number; orderBy?: SmartPlaylistOrderBy } = {}
  ) {
    return evaluate({ matchType, rules, ...extra });
  }

  /**
   * Set a measurement the analysis engine owns.
   *
   * Written straight to the column because `db:tracks:add` does not accept it —
   * `newTrackSchema` covers tag metadata only, and zod strips the rest.
   */
  function setLoudness(trackId: string, loudnessLufs: number | null) {
    getDatabase().update(tracks).set({ loudnessLufs }).where(eq(tracks.id, trackId)).run();
  }

  /**
   * Write a `play_history` row directly rather than through
   * `db:history:record-play`, which always stamps "now" — every rule under test
   * here turns on a play being *older* than a cutoff.
   */
  function recordPlay(trackId: string, daysAgo: number, source = 'library') {
    getDatabase()
      .insert(playHistory)
      .values({
        id: crypto.randomUUID(),
        trackId,
        playedAt: sql`datetime('now', ${`-${daysAgo} days`})` as unknown as string,
        playedSeconds: 120,
        completionRatio: 1,
        completed: true,
        source,
      })
      .run();
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

  it('matches nothing when no track satisfies the rules', async () => {
    await insertTrack({ genre: 'Lofi' });

    expect(await preview('all', [{ field: 'genre', operator: 'is', value: 'Polka' }])).toEqual([]);
  });

  // ── lastPlayed ──────────────────────────────────────────────────────────

  describe('lastPlayed', () => {
    it('inLastDays matches only tracks played inside the window', async () => {
      const recent = await insertTrack({ title: 'Recent' });
      const stale = await insertTrack({ title: 'Stale' });
      await insertTrack({ title: 'Never' });
      recordPlay(recent.id, 3);
      recordPlay(stale.id, 120);

      const rows = await preview('all', [
        { field: 'lastPlayed', operator: 'inLastDays', value: '90' },
      ]);
      expect(rows.map(r => r.title)).toEqual(['Recent']);
    });

    it('notInLastDays includes a track that was never played at all', async () => {
      const recent = await insertTrack({ title: 'Recent' });
      const stale = await insertTrack({ title: 'Stale' });
      await insertTrack({ title: 'Never' });
      recordPlay(recent.id, 3);
      recordPlay(stale.id, 120);

      const rows = await preview('all', [
        { field: 'lastPlayed', operator: 'notInLastDays', value: '90' },
      ]);
      // The never-played track is the case this rule exists for: a
      // `MAX(played_at) < cutoff` comparison would yield NULL and drop it.
      expect(rows.map(r => r.title).sort()).toEqual(['Never', 'Stale']);
    });

    it('counts a track as recently played on its newest play, not its oldest', async () => {
      const track = await insertTrack({ title: 'Revisited' });
      recordPlay(track.id, 400);
      recordPlay(track.id, 2);

      expect(
        await preview('all', [{ field: 'lastPlayed', operator: 'inLastDays', value: '30' }])
      ).toHaveLength(1);
      expect(
        await preview('all', [{ field: 'lastPlayed', operator: 'notInLastDays', value: '30' }])
      ).toEqual([]);
    });

    it('ignores radio plays entirely, in both directions', async () => {
      const track = await insertTrack({ title: 'Radio only' });
      recordPlay(track.id, 1, 'radio');

      // A radio row is not a play of this track. It must neither satisfy
      // "played recently" nor stop the track satisfying "not played recently".
      expect(
        await preview('all', [{ field: 'lastPlayed', operator: 'inLastDays', value: '30' }])
      ).toEqual([]);
      expect(
        await preview('all', [{ field: 'lastPlayed', operator: 'notInLastDays', value: '30' }])
      ).toHaveLength(1);
    });

    it('drops a rule whose day count is not a usable number', async () => {
      await insertTrack();
      // Unusable rules are dropped, so this widens to the whole library rather
      // than matching nothing — v1's behaviour, preserved.
      expect(
        await preview('all', [{ field: 'lastPlayed', operator: 'inLastDays', value: 'soon' }])
      ).toHaveLength(1);
    });
  });

  // ── the numeric analysis fields ─────────────────────────────────────────

  describe('numeric fields', () => {
    it('filters by duration between', async () => {
      await insertTrack({ title: 'Short', duration: 60 });
      await insertTrack({ title: 'Medium', duration: 200 });
      await insertTrack({ title: 'Long', duration: 600 });

      const rows = await preview('all', [
        { field: 'duration', operator: 'between', value: '100', valueTo: '300' },
      ]);
      expect(rows.map(r => r.title)).toEqual(['Medium']);
    });

    it('filters by loudnessLufs lessThan, negative values included', async () => {
      setLoudness((await insertTrack({ title: 'Quiet' })).id, -18.5);
      setLoudness((await insertTrack({ title: 'Loud' })).id, -6.2);

      const rows = await preview('all', [
        { field: 'loudnessLufs', operator: 'lessThan', value: '-10' },
      ]);
      expect(rows.map(r => r.title)).toEqual(['Quiet']);
    });

    it('excludes an unanalysed track from every operator, isNot included', async () => {
      setLoudness((await insertTrack({ title: 'Analysed' })).id, -14);
      await insertTrack({ title: 'Unanalysed' });

      // SQL three-valued logic: NULL satisfies no comparison. Documented on
      // SmartPlaylistRule — "unknown" must not read as "does not equal", or an
      // `all` definition silently fills with unanalysed tracks.
      const isNot = await preview('all', [
        { field: 'loudnessLufs', operator: 'isNot', value: '-14' },
      ]);
      expect(isNot).toEqual([]);

      const greater = await preview('all', [
        { field: 'loudnessLufs', operator: 'greaterThan', value: '-99' },
      ]);
      expect(greater.map(r => r.title)).toEqual(['Analysed']);
    });
  });

  // ── fields this schema has no column for ────────────────────────────────

  describe('fields this build cannot evaluate', () => {
    it('returns no tracks for a bpm rule rather than a wider set', async () => {
      await insertTrack({ genre: 'Lofi' });
      await insertTrack({ genre: 'Rock' });

      // v1's schema has no `bpm` column. Dropping the rule would return the
      // whole library and present it as the answer to "bpm 100-130".
      expect(
        await preview('all', [{ field: 'bpm', operator: 'between', value: '100', valueTo: '130' }])
      ).toEqual([]);
      expect(await preview('all', [{ field: 'musicalKey', operator: 'is', value: '8A' }])).toEqual(
        []
      );
    });

    it('fails closed under matchAny too, where one rule would otherwise match', async () => {
      await insertTrack({ genre: 'Lofi' });

      // Under `any` the genre rule alone would match. The definition as a whole
      // is still unanswerable, so it selects nothing.
      expect(
        await preview('any', [
          { field: 'genre', operator: 'is', value: 'Lofi' },
          { field: 'bpm', operator: 'greaterThan', value: '100' },
        ])
      ).toEqual([]);
    });
  });

  // ── limit and orderBy ───────────────────────────────────────────────────

  describe('limit and orderBy', () => {
    async function withPlayCount(title: string, plays: number) {
      const track = await insertTrack({ title });
      const increment = ipcHandlers.get('db:tracks:increment-play-count')!;
      for (let i = 0; i < plays; i++) await increment(null as never, track.id);
      return track;
    }

    it('expresses "top 2 most played"', async () => {
      await withPlayCount('Third', 1);
      await withPlayCount('First', 9);
      await withPlayCount('Second', 5);

      const rows = await preview('all', [], {
        limit: 2,
        orderBy: { field: 'playCount', direction: 'desc' },
      });
      expect(rows.map(r => r.title)).toEqual(['First', 'Second']);
    });

    it('expresses "least recently played", never-played first', async () => {
      const recent = await insertTrack({ title: 'Recent' });
      const stale = await insertTrack({ title: 'Stale' });
      await insertTrack({ title: 'Never' });
      recordPlay(recent.id, 1);
      recordPlay(stale.id, 200);

      const rows = await preview('all', [], {
        orderBy: { field: 'lastPlayed', direction: 'asc' },
      });
      // A track never played is the least recently played thing there is, and
      // NULL sorting lowest puts it exactly there.
      expect(rows.map(r => r.title)).toEqual(['Never', 'Stale', 'Recent']);
    });

    it('applies the limit after the rules, not before them', async () => {
      await insertTrack({ title: 'Lofi A', genre: 'Lofi' });
      await insertTrack({ title: 'Rock', genre: 'Rock' });
      await insertTrack({ title: 'Lofi B', genre: 'Lofi' });

      const rows = await preview('all', [{ field: 'genre', operator: 'is', value: 'Lofi' }], {
        limit: 5,
      });
      expect(rows.map(r => r.title).sort()).toEqual(['Lofi A', 'Lofi B']);
    });

    it('honours a limit alongside matchAny', async () => {
      await withPlayCount('Popular Jazz', 7);
      await insertTrack({ title: 'Lofi', genre: 'Lofi' });
      await insertTrack({ title: 'Ignored', genre: 'Rock' });

      const rows = await preview(
        'any',
        [
          { field: 'genre', operator: 'is', value: 'Lofi' },
          { field: 'playCount', operator: 'greaterThan', value: '5' },
        ],
        { limit: 1, orderBy: { field: 'playCount', direction: 'desc' } }
      );
      expect(rows.map(r => r.title)).toEqual(['Popular Jazz']);
    });

    it('rejects a non-positive limit at the boundary', async () => {
      await insertTrack();

      // A zero limit is a malformed definition, not "no limit" — the absent
      // field is how the editor says that. Caught by zod before the query
      // builder, which keeps its own guard for definitions read off disk.
      await expect(preview('all', [], { limit: 0 })).rejects.toThrow(/BAD_REQUEST/);
    });
  });

  // ── storage compatibility ───────────────────────────────────────────────

  describe('the rules column', () => {
    const create = () => ipcHandlers.get('db:smart-playlists:create')!;
    const getTracks = () => ipcHandlers.get('db:smart-playlists:get-tracks')!;

    function storedRules(id: string): string {
      return getDatabase().select().from(smartPlaylists).where(eq(smartPlaylists.id, id)).get()!
        .rules;
    }

    it('still writes a bare array when there is no limit and no sort', async () => {
      const created = (await create()(null as never, {
        name: 'Plain',
        matchType: 'all',
        rules: [{ field: 'genre', operator: 'is', value: 'Lofi' }],
      })) as { id: string };

      // Byte-identical to what a build predating limit/orderBy would write, so
      // one can still read it.
      expect(JSON.parse(storedRules(created.id))).toEqual([
        { field: 'genre', operator: 'is', value: 'Lofi' },
      ]);
    });

    it('round-trips a limit and a sort through the envelope', async () => {
      const created = (await create()(null as never, {
        name: 'Top 25',
        matchType: 'all',
        rules: [],
        limit: 25,
        orderBy: { field: 'playCount', direction: 'desc' },
      })) as { id: string; limit?: number; orderBy?: SmartPlaylistOrderBy };

      expect(created.limit).toBe(25);
      expect(created.orderBy).toEqual({ field: 'playCount', direction: 'desc' });

      const get = ipcHandlers.get('db:smart-playlists:get')!;
      const read = (await get(null as never, created.id)) as {
        limit?: number;
        orderBy?: SmartPlaylistOrderBy;
      };
      expect(read.limit).toBe(25);
      expect(read.orderBy).toEqual({ field: 'playCount', direction: 'desc' });
    });

    it('keeps evaluating a playlist saved before limit/orderBy existed', async () => {
      await insertTrack({ genre: 'Lofi' });
      await insertTrack({ genre: 'Rock' });

      // Written exactly as the pre-change handler wrote it: a bare array, with
      // no envelope and no limit.
      const id = crypto.randomUUID();
      getDatabase()
        .insert(smartPlaylists)
        .values({
          id,
          name: 'Legacy',
          matchType: 'all',
          rules: JSON.stringify([{ field: 'genre', operator: 'is', value: 'Lofi' }]),
        })
        .run();

      const rows = (await getTracks()(null as never, id)) as PreviewRow[];
      expect(rows).toHaveLength(1);
      expect(rows[0].genre).toBe('Lofi');
    });

    it('rewrites all three when an update names the rules, clearing a stale limit', async () => {
      const created = (await create()(null as never, {
        name: 'Top 25',
        matchType: 'all',
        rules: [],
        limit: 25,
      })) as { id: string };

      const update = ipcHandlers.get('db:smart-playlists:update')!;
      const updated = (await update(null as never, created.id, {
        rules: [{ field: 'genre', operator: 'is', value: 'Lofi' }],
      })) as { limit?: number; rules: SmartPlaylistRule[] };

      expect(updated.rules).toHaveLength(1);
      expect(updated.limit).toBeUndefined();
    });

    it('keeps the stored rules when an update names only the limit', async () => {
      const created = (await create()(null as never, {
        name: 'Lofi',
        matchType: 'all',
        rules: [{ field: 'genre', operator: 'is', value: 'Lofi' }],
      })) as { id: string };

      const update = ipcHandlers.get('db:smart-playlists:update')!;
      const updated = (await update(null as never, created.id, { limit: 10 })) as {
        limit?: number;
        rules: SmartPlaylistRule[];
      };

      expect(updated.limit).toBe(10);
      expect(updated.rules).toHaveLength(1);
    });
  });
});
