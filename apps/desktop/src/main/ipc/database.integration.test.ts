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
    const updated = (await update(null as never, track.id, { title: 'New Title' })) as { title: string };

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
    const result = (await getTracks(null as never, playlist.id)) as Array<{ id: string; title: string }>;

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
