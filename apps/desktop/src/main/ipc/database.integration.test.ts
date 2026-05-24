import { join } from 'node:path';
import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDatabase, initializeDatabase, getDatabase } from '@shiranami/database/client';
import { playHistory, tracks } from '@shiranami/database';
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

  /* ------------------------------------------------------------------ */
  /*  Helper to insert a track                                          */
  /* ------------------------------------------------------------------ */

  async function insertTrack(overrides: Record<string, unknown> = {}) {
    const addTrack = ipcHandlers.get('db:tracks:add')!;
    return (await addTrack(null as never, {
      filePath: `/music/${crypto.randomUUID()}.mp3`,
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 200,
      ...overrides,
    })) as { id: string; filePath: string; title: string; isFavorite: boolean; playCount: number };
  }

  /* ------------------------------------------------------------------ */
  /*  History (existing test)                                           */
  /* ------------------------------------------------------------------ */

  it('record-play, get-recent, get-summary, and get-activity against a temp db', async () => {
    const track = await insertTrack({
      filePath: '/music/test-track.mp3',
      title: 'Integration Track',
    });

    const recordPlay = ipcHandlers.get('db:history:record-play')!;
    await recordPlay(null as never, {
      trackId: track.id,
      playedSeconds: 180,
      duration: 200,
      source: 'library',
    });

    const getRecent = ipcHandlers.get('db:history:get-recent')!;
    const recent = (await getRecent(null as never, { limit: 10 })) as Array<{
      trackId: string;
      title: string;
    }>;
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
    expect(summary.topTracks.some(r => r.trackId === track.id)).toBe(true);

    const getActivity = ipcHandlers.get('db:history:get-activity')!;
    const activity = (await getActivity(null as never, {})) as Array<{ playCount: number }>;
    expect(activity.length).toBeGreaterThanOrEqual(1);
    expect(activity.some(a => a.playCount >= 1)).toBe(true);
  });

  it('coalesces NULL artist/album to Unknown sentinels in get-recent and get-summary', async () => {
    // Insert a track with NULL artist/album directly (simulating an untagged
    // scan or a row predating backfill). The wire types declare these non-null,
    // so the handler must collapse them or the UI renders the literal "null".
    const db = getDatabase();
    const trackId = crypto.randomUUID();
    db.insert(tracks)
      .values({
        id: trackId,
        filePath: `/music/${trackId}.mp3`,
        title: 'Null Meta Track',
        artist: null,
        album: null,
        duration: 120,
      })
      .run();

    const recordPlay = ipcHandlers.get('db:history:record-play')!;
    await recordPlay(null as never, {
      trackId,
      playedSeconds: 90,
      duration: 120,
      source: 'library',
    });

    const getRecent = ipcHandlers.get('db:history:get-recent')!;
    const recent = (await getRecent(null as never, { limit: 10 })) as Array<{
      trackId: string;
      artist: string;
      album: string;
    }>;
    const entry = recent.find(r => r.trackId === trackId)!;
    expect(entry.artist).toBe('Unknown Artist');
    expect(entry.album).toBe('Unknown Album');

    const getSummary = ipcHandlers.get('db:history:get-summary')!;
    const summary = (await getSummary(null as never, {})) as {
      topTracks: Array<{ trackId: string; artist: string; album: string }>;
      topArtists: Array<{ artist: string }>;
    };
    const topTrack = summary.topTracks.find(r => r.trackId === trackId)!;
    expect(topTrack.artist).toBe('Unknown Artist');
    expect(topTrack.album).toBe('Unknown Album');
    expect(summary.topArtists.some(a => a.artist === 'Unknown Artist')).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /*  History aggregations: hourly activity + weekly insights            */
  /* ------------------------------------------------------------------ */

  // recordPlay stamps `new Date()`, so insert play_history rows directly to
  // control the timestamps the bucketing/sessionization logic reads.
  function insertPlayAt(trackId: string, playedAt: string, playedSeconds = 120) {
    getDatabase()
      .insert(playHistory)
      .values({
        id: crypto.randomUUID(),
        trackId,
        playedAt,
        playedSeconds,
        completionRatio: 1,
        completed: true,
        source: 'library',
      })
      .run();
  }

  it('get-hourly-activity returns local-time day-of-week × hour buckets', async () => {
    const track = await insertTrack({ title: 'Hourly Track' });
    // Two plays in the same local hour, one in a different hour.
    insertPlayAt(track.id, '2026-05-18T22:10:00');
    insertPlayAt(track.id, '2026-05-18T22:40:00');
    insertPlayAt(track.id, '2026-05-19T09:00:00');

    const getHourly = ipcHandlers.get('db:history:get-hourly-activity')!;
    const rows = (await getHourly(null as never, {})) as Array<{
      dayOfWeek: number;
      hour: number;
      playCount: number;
    }>;

    const total = rows.reduce((sum, r) => sum + r.playCount, 0);
    expect(total).toBe(3);
    // dayOfWeek is SQLite-indexed (0=Sun..6=Sat) and hour is 0–23.
    for (const row of rows) {
      expect(row.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(row.dayOfWeek).toBeLessThanOrEqual(6);
      expect(row.hour).toBeGreaterThanOrEqual(0);
      expect(row.hour).toBeLessThanOrEqual(23);
    }
  });

  it('get-weekly-insights counts gap-based sessions and top albums', async () => {
    const trackA = await insertTrack({ title: 'A', album: 'Album One' });
    const trackB = await insertTrack({ title: 'B', album: 'Album Two' });

    // Session 1: two plays 10 min apart.
    insertPlayAt(trackA.id, '2026-05-18T20:00:00');
    insertPlayAt(trackA.id, '2026-05-18T20:10:00');
    // > 30 min gap → session 2.
    insertPlayAt(trackA.id, '2026-05-18T21:00:00');
    insertPlayAt(trackB.id, '2026-05-18T21:05:00');
    // > 30 min gap → session 3.
    insertPlayAt(trackB.id, '2026-05-19T09:00:00');

    const getInsights = ipcHandlers.get('db:history:get-weekly-insights')!;
    const insights = (await getInsights(null as never, {})) as {
      sessionCount: number;
      topAlbums: Array<{ album: string; playCount: number }>;
    };

    expect(insights.sessionCount).toBe(3);
    expect(insights.topAlbums.length).toBe(2);
    // Album One has 3 plays, Album Two has 2 — Album One leads.
    expect(insights.topAlbums[0]!.album).toBe('Album One');
    expect(insights.topAlbums[0]!.playCount).toBe(3);
  });

  it('get-weekly-insights excludes empty-album rows from top albums', async () => {
    const untagged = await insertTrack({ title: 'Untagged', album: '' });
    insertPlayAt(untagged.id, '2026-05-18T20:00:00');

    const getInsights = ipcHandlers.get('db:history:get-weekly-insights')!;
    const insights = (await getInsights(null as never, {})) as {
      sessionCount: number;
      topAlbums: Array<{ album: string }>;
    };

    expect(insights.sessionCount).toBe(1);
    expect(insights.topAlbums).toHaveLength(0);
  });

  it('get-summary honors the until upper bound for prior-window trends', async () => {
    const track = await insertTrack({ title: 'Windowed' });
    insertPlayAt(track.id, '2026-05-10T12:00:00', 600); // prior window
    insertPlayAt(track.id, '2026-05-20T12:00:00', 600); // current window

    const getSummary = ipcHandlers.get('db:history:get-summary')!;
    const prior = (await getSummary(null as never, {
      since: '2026-05-08T00:00:00.000Z',
      until: '2026-05-15T00:00:00.000Z',
    })) as { totalPlays: number };

    expect(prior.totalPlays).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /*  tracks:add                                                        */
  /* ------------------------------------------------------------------ */

  it('tracks:add inserts a track and returns the row with a generated id', async () => {
    const track = await insertTrack({ title: 'New Song', artist: 'Artist A' });

    expect(track.id).toBeDefined();
    expect(typeof track.id).toBe('string');
    expect(track.title).toBe('New Song');

    const getAll = ipcHandlers.get('db:tracks:get-all')!;
    const all = (await getAll(null as never)) as Array<{ id: string }>;
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(track.id);
  });

  /* ------------------------------------------------------------------ */
  /*  tracks:add-many (bulk insert with chunking)                       */
  /* ------------------------------------------------------------------ */

  it('tracks:add-many inserts a small batch and returns all rows', async () => {
    const addMany = ipcHandlers.get('db:tracks:add-many')!;
    const incoming = Array.from({ length: 5 }, (_, i) => ({
      filePath: `/music/batch-${i}.mp3`,
      title: `Batch Track ${i}`,
      artist: 'Batch Artist',
      album: 'Batch Album',
      duration: 180,
    }));

    const result = (await addMany(null as never, incoming)) as Array<{ id: string; title: string }>;

    expect(result).toHaveLength(5);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.title).toBe('Batch Track 0');
    expect(result[4]!.title).toBe('Batch Track 4');

    const getAll = ipcHandlers.get('db:tracks:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(5);
  });

  it('tracks:add-many handles more than 100 tracks (chunk boundary)', async () => {
    const addMany = ipcHandlers.get('db:tracks:add-many')!;
    const incoming = Array.from({ length: 250 }, (_, i) => ({
      filePath: `/music/large-batch-${i}.mp3`,
      title: `Track ${i}`,
      artist: 'Artist',
      album: 'Album',
      duration: 120,
    }));

    const result = (await addMany(null as never, incoming)) as Array<{ id: string }>;

    expect(result).toHaveLength(250);
    // Every row should have a unique id
    const ids = new Set(result.map(r => r.id));
    expect(ids.size).toBe(250);

    const getAll = ipcHandlers.get('db:tracks:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(250);
  });

  it('tracks:add-many handles empty array', async () => {
    const addMany = ipcHandlers.get('db:tracks:add-many')!;
    const result = (await addMany(null as never, [])) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('tracks:add-many handles exactly 100 tracks (one full chunk)', async () => {
    const addMany = ipcHandlers.get('db:tracks:add-many')!;
    const incoming = Array.from({ length: 100 }, (_, i) => ({
      filePath: `/music/exact-chunk-${i}.mp3`,
      title: `Track ${i}`,
      artist: 'Artist',
      album: 'Album',
      duration: 120,
    }));

    const result = (await addMany(null as never, incoming)) as Array<{ id: string }>;
    expect(result).toHaveLength(100);

    const getAll = ipcHandlers.get('db:tracks:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(100);
  });

  it('tracks:remove-many handles chunked deletion', async () => {
    const addMany = ipcHandlers.get('db:tracks:add-many')!;
    const incoming = Array.from({ length: 10 }, (_, i) => ({
      filePath: `/music/remove-many-${i}.mp3`,
      title: `Remove Track ${i}`,
      artist: 'Artist',
      album: 'Album',
      duration: 120,
    }));

    const added = (await addMany(null as never, incoming)) as Array<{ id: string }>;
    expect(added).toHaveLength(10);

    const removeMany = ipcHandlers.get('db:tracks:remove-many')!;
    await removeMany(
      null as never,
      added.map(t => t.id)
    );

    const getAll = ipcHandlers.get('db:tracks:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ */
  /*  tracks:remove                                                     */
  /* ------------------------------------------------------------------ */

  it('tracks:remove deletes a track by id', async () => {
    const track = await insertTrack();

    const remove = ipcHandlers.get('db:tracks:remove')!;
    await remove(null as never, track.id);

    const getAll = ipcHandlers.get('db:tracks:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ */
  /*  tracks:update                                                     */
  /* ------------------------------------------------------------------ */

  it('tracks:update changes track fields and returns updated row', async () => {
    const track = await insertTrack({ title: 'Old Title' });

    const update = ipcHandlers.get('db:tracks:update')!;
    const updated = (await update(null as never, track.id, { title: 'New Title' })) as {
      title: string;
    };

    expect(updated.title).toBe('New Title');
  });

  /* ------------------------------------------------------------------ */
  /*  tracks:toggle-favorite                                            */
  /* ------------------------------------------------------------------ */

  it('tracks:toggle-favorite flips the isFavorite flag', async () => {
    const track = await insertTrack();
    expect(track.isFavorite).toBeFalsy();

    const toggle = ipcHandlers.get('db:tracks:toggle-favorite')!;
    const toggled = (await toggle(null as never, track.id)) as { isFavorite: boolean };
    // SQLite stores booleans as 0/1; after NOT 0 we get 1 (truthy)
    expect(toggled.isFavorite).toBeTruthy();

    const toggledBack = (await toggle(null as never, track.id)) as { isFavorite: boolean };
    expect(toggledBack.isFavorite).toBeFalsy();
  });

  /* ------------------------------------------------------------------ */
  /*  tracks:exists                                                     */
  /* ------------------------------------------------------------------ */

  it('tracks:exists returns true for existing file path and false for unknown', async () => {
    await insertTrack({ filePath: '/music/exists.mp3' });

    const exists = ipcHandlers.get('db:tracks:exists')!;
    expect(await exists(null as never, '/music/exists.mp3')).toBe(true);
    expect(await exists(null as never, '/music/nope.mp3')).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /*  playlists:create                                                  */
  /* ------------------------------------------------------------------ */

  it('playlists:create inserts a playlist and returns it', async () => {
    const create = ipcHandlers.get('db:playlists:create')!;
    const playlist = (await create(null as never, {
      name: 'My Playlist',
      description: 'A test playlist',
    })) as { id: string; name: string; description: string };

    expect(playlist.id).toBeDefined();
    expect(playlist.name).toBe('My Playlist');
    expect(playlist.description).toBe('A test playlist');
  });

  /* ------------------------------------------------------------------ */
  /*  playlists:delete                                                  */
  /* ------------------------------------------------------------------ */

  it('playlists:delete removes a playlist', async () => {
    const create = ipcHandlers.get('db:playlists:create')!;
    const playlist = (await create(null as never, { name: 'To Delete' })) as { id: string };

    const del = ipcHandlers.get('db:playlists:delete')!;
    await del(null as never, playlist.id);

    const getAll = ipcHandlers.get('db:playlists:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ */
  /*  playlists:get-tracks (returns tracks in order)                    */
  /* ------------------------------------------------------------------ */

  it('playlists:get-tracks returns tracks in insertion order', async () => {
    const trackA = await insertTrack({ title: 'Track A' });
    const trackB = await insertTrack({ title: 'Track B' });

    const create = ipcHandlers.get('db:playlists:create')!;
    const playlist = (await create(null as never, { name: 'Ordered' })) as { id: string };

    const addTrackToPlaylist = ipcHandlers.get('db:playlists:add-track')!;
    await addTrackToPlaylist(null as never, { playlistId: playlist.id, trackId: trackA.id });
    await addTrackToPlaylist(null as never, { playlistId: playlist.id, trackId: trackB.id });

    const getTracks = ipcHandlers.get('db:playlists:get-tracks')!;
    const result = (await getTracks(null as never, playlist.id)) as Array<{
      id: string;
      title: string;
    }>;

    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe('Track A');
    expect(result[1]!.title).toBe('Track B');
  });

  /* ------------------------------------------------------------------ */
  /*  playlists:add-track (duplicate prevention)                        */
  /* ------------------------------------------------------------------ */

  it('playlists:add-track does not duplicate an existing entry', async () => {
    const track = await insertTrack();
    const create = ipcHandlers.get('db:playlists:create')!;
    const playlist = (await create(null as never, { name: 'Dupes' })) as { id: string };

    const addTrackToPlaylist = ipcHandlers.get('db:playlists:add-track')!;
    await addTrackToPlaylist(null as never, { playlistId: playlist.id, trackId: track.id });
    await addTrackToPlaylist(null as never, { playlistId: playlist.id, trackId: track.id });

    const getTracks = ipcHandlers.get('db:playlists:get-tracks')!;
    const result = (await getTracks(null as never, playlist.id)) as unknown[];
    expect(result).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ */
  /*  playlists:remove-track                                            */
  /* ------------------------------------------------------------------ */

  it('playlists:remove-track removes a track from the playlist', async () => {
    const track = await insertTrack();
    const create = ipcHandlers.get('db:playlists:create')!;
    const playlist = (await create(null as never, { name: 'Remove Test' })) as { id: string };

    const addTrackToPlaylist = ipcHandlers.get('db:playlists:add-track')!;
    await addTrackToPlaylist(null as never, { playlistId: playlist.id, trackId: track.id });

    const removeTrack = ipcHandlers.get('db:playlists:remove-track')!;
    await removeTrack(null as never, { playlistId: playlist.id, trackId: track.id });

    const getTracks = ipcHandlers.get('db:playlists:get-tracks')!;
    const result = (await getTracks(null as never, playlist.id)) as unknown[];
    expect(result).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ */
  /*  folders:add                                                       */
  /* ------------------------------------------------------------------ */

  it('folders:add inserts a folder and returns it', async () => {
    const add = ipcHandlers.get('db:folders:add')!;
    const folder = (await add(null as never, '/home/user/Music')) as { id: string; path: string };

    expect(folder.id).toBeDefined();
    expect(folder.path).toBe('/home/user/Music');
  });

  /* ------------------------------------------------------------------ */
  /*  folders:remove                                                    */
  /* ------------------------------------------------------------------ */

  it('folders:remove deletes a folder by id', async () => {
    const add = ipcHandlers.get('db:folders:add')!;
    const folder = (await add(null as never, '/home/user/Music')) as { id: string };

    const remove = ipcHandlers.get('db:folders:remove')!;
    await remove(null as never, folder.id);

    const getAll = ipcHandlers.get('db:folders:get-all')!;
    const all = (await getAll(null as never)) as unknown[];
    expect(all).toHaveLength(0);
  });
});
