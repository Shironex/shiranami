import type { SQLiteDatabase } from 'expo-sqlite';
import type { ManifestTrack } from '@shiranami/contracts/sync';
import { migrateDbIfNeeded } from '@/lib/db';
import { loadLibrary } from '@/lib/library';
import { loadPlaylists } from '@/lib/playlists';
import {
  applyArtwork,
  applyManifest,
  completeDownload,
  loadDesktopIds,
  mergeFavorites,
  mergeHistory,
  mergePlaylists,
  pendingPath,
  planManifest,
  toSqliteTime,
  type LinkRow,
} from '@/lib/sync-library';
import { openTestDb } from './support/sqlite';

function track(id: string, extra: Partial<ManifestTrack> = {}): ManifestTrack {
  return {
    id,
    title: `Song ${id}`,
    artist: 'Desk Artist',
    albumArtist: null,
    album: 'Desk Album',
    genre: null,
    year: 2024,
    trackNumber: 1,
    discNumber: null,
    duration: 200,
    contentHash: `a1:${id}`,
    artworkHash: null,
    sizeBytes: 1000,
    fileVersion: `1000-${id}`,
    format: 'mp3',
    isFavorite: false,
    playCount: 0,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    ...extra,
  };
}

function row(id: string, extra: Partial<LinkRow> = {}): LinkRow {
  return { id, desktop_id: null, content_hash: null, source: 'device', missing: 0, ...extra };
}

async function freshDb(): Promise<SQLiteDatabase & { close: () => void }> {
  const db = openTestDb();
  await migrateDbIfNeeded(db);
  return db;
}

describe('planManifest', () => {
  it('links a song the phone already has by content hash instead of downloading it', () => {
    const plan = planManifest(
      [row('phone-1', { content_hash: 'a1:x' })],
      [track('d1', { contentHash: 'a1:x' })]
    );
    expect(plan.links).toEqual([
      { rowId: 'phone-1', track: expect.objectContaining({ id: 'd1' }) },
    ]);
    expect(plan.inserts).toEqual([]);
    expect(plan.downloads).toEqual([]);
  });

  it('prefers the matching row whose file is there, and downloads into a matched row that lost it', () => {
    const present = planManifest(
      [row('gone', { content_hash: 'a1:x', missing: 1 }), row('here', { content_hash: 'a1:x' })],
      [track('d1', { contentHash: 'a1:x' })]
    );
    expect(present.links[0].rowId).toBe('here');
    expect(present.downloads).toEqual([]);

    const lost = planManifest(
      [row('gone', { content_hash: 'a1:x', missing: 1 })],
      [track('d1', { contentHash: 'a1:x' })]
    );
    expect(lost.downloads.map(job => job.rowId)).toEqual(['gone']);
  });

  it('adds new songs under the desktop id and skips audio the desktop no longer has', () => {
    const plan = planManifest([], [track('d1'), track('d2', { sizeBytes: null })]);
    expect(plan.inserts.map(i => i.rowId)).toEqual(['d1', 'd2']);
    expect(plan.downloads.map(job => job.rowId)).toEqual(['d1']);
  });

  it('refreshes tags of earlier synced rows and downloads again only when the audio changed', () => {
    const rows = [
      row('d1', { desktop_id: 'd1', content_hash: 'a1:d1', source: 'desktop' }),
      row('d2', { desktop_id: 'd2', content_hash: 'a1:old', source: 'desktop' }),
    ];
    const plan = planManifest(rows, [track('d1', { title: 'Renamed' }), track('d2')]);
    expect(plan.updates.map(u => u.rowId)).toEqual(['d1', 'd2']);
    expect(plan.downloads.map(job => job.rowId)).toEqual(['d2']);
  });

  it('gives a second desktop copy of the same song its own row', () => {
    const plan = planManifest(
      [row('phone-1', { content_hash: 'a1:x' })],
      [track('d1', { contentHash: 'a1:x' }), track('d2', { contentHash: 'a1:x' })]
    );
    expect(plan.links.map(l => l.track.id)).toEqual(['d1']);
    expect(plan.inserts.map(i => i.rowId)).toEqual(['d2']);
  });
});

describe('applyManifest and the merges', () => {
  it('keeps pending songs out of the library until their audio lands', async () => {
    const db = await freshDb();
    const plan = await applyManifest(db, [track('d1', { playCount: 4 })]);
    expect(await loadLibrary(db)).toEqual([]);

    await completeDownload(db, plan.downloads[0], 'file:///tracks/d1.mp3', 1000);
    const [song] = await loadLibrary(db);
    expect(song).toMatchObject({
      id: 'd1',
      filePath: 'file:///tracks/d1.mp3',
      title: 'Song d1',
      playCount: 4,
    });
    const stored = await db.getFirstAsync<{ source: string; desktop_version: string }>(
      "SELECT source, desktop_version FROM tracks WHERE id = 'd1'"
    );
    expect(stored).toEqual({ source: 'desktop', desktop_version: '1000-d1' });
  });

  it('links an existing phone song and keeps its id, file and favorite', async () => {
    const db = await freshDb();
    await db.runAsync(
      "INSERT INTO tracks (id, file_path, title, content_hash, source, is_favorite) VALUES ('p1', 'content://media/1', 'Mine', 'a1:x', 'device', 1)"
    );
    const plan = await applyManifest(db, [track('d1', { contentHash: 'a1:x' })]);
    expect(plan.downloads).toEqual([]);
    expect(await loadDesktopIds(db)).toEqual(new Map([['d1', 'p1']]));
    const [song] = await loadLibrary(db);
    expect(song).toMatchObject({
      id: 'p1',
      filePath: 'content://media/1',
      title: 'Mine',
      isFavorite: true,
    });
  });

  it('adds desktop favorites without taking any phone heart away', async () => {
    const db = await freshDb();
    await db.runAsync(
      "INSERT INTO tracks (id, file_path, title, is_favorite) VALUES ('p1', 'file:///p1', 'Phone fav', 1)"
    );
    await applyManifest(db, [track('d1'), track('d2')]);
    const ids = await loadDesktopIds(db);
    expect(await mergeFavorites(db, ['d2', 'unknown'], ids)).toBe(1);
    const favorites = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM tracks WHERE is_favorite = 1 ORDER BY id'
    );
    expect(favorites.map(f => f.id)).toEqual(['d2', 'p1']);
  });

  it('merges playlists: desktop order wins for synced ones, phone playlists stay as they are', async () => {
    const db = await freshDb();
    await applyManifest(db, [track('d1'), track('d2'), track('d3')]);
    await db.runAsync("INSERT INTO playlists (id, name) VALUES ('mine', 'Phone list')");
    await db.runAsync(
      "INSERT INTO playlist_tracks (id, playlist_id, track_id, position) VALUES ('x', 'mine', 'd1', 0)"
    );
    const ids = await loadDesktopIds(db);
    const base = { description: null, artworkHash: null, createdAt: '', updatedAt: '' };
    await mergePlaylists(
      db,
      [{ ...base, id: 'pl-1', name: 'Night', trackIds: ['d3', 'd1', 'nope', 'd3'] }],
      ids
    );
    await mergePlaylists(
      db,
      [{ ...base, id: 'pl-1', name: 'Night drive', trackIds: ['d2', 'd3'] }],
      ids
    );

    const playlists = await loadPlaylists(db);
    const byId = new Map(playlists.map(p => [p.id, p]));
    expect(byId.get('pl-1')).toMatchObject({ name: 'Night drive', trackIds: ['d2', 'd3'] });
    expect(byId.get('mine')).toMatchObject({ name: 'Phone list', trackIds: ['d1'] });
  });

  it('adds desktop plays once, in the phone time format', async () => {
    const db = await freshDb();
    await applyManifest(db, [track('d1')]);
    const ids = await loadDesktopIds(db);
    const entry = {
      id: 'h1',
      trackId: 'd1',
      playedAt: '2026-11-07T21:04:05.123Z',
      playedSeconds: null,
      completionRatio: 0.5,
      completed: false,
      source: 'library',
    };
    expect(await mergeHistory(db, [entry, { ...entry, id: 'h2', trackId: 'gone' }], ids)).toBe(1);
    expect(await mergeHistory(db, [entry], ids)).toBe(0);
    const plays = await db.getAllAsync<{ played_at: string; played_seconds: number }>(
      'SELECT played_at, played_seconds FROM play_history'
    );
    expect(plays).toEqual([{ played_at: '2026-11-07 21:04:05', played_seconds: 0 }]);
  });

  it('merges more plays than SQLite takes bind parameters in one statement', async () => {
    const db = await freshDb();
    await applyManifest(db, [track('d1')]);
    const ids = await loadDesktopIds(db);
    // SQLite's default cap is 32766 parameters per statement.
    const entries = Array.from({ length: 33000 }, (_, i) => ({
      id: `h${i}`,
      trackId: 'd1',
      playedAt: '2026-11-07T21:04:05Z',
      playedSeconds: 60,
      completionRatio: 0.5,
      completed: false,
      source: 'library',
    }));
    expect(await mergeHistory(db, entries, ids)).toBe(33000);
    expect(await mergeHistory(db, entries.slice(0, 600), ids)).toBe(0);
  });

  it('sets a cover only on rows that have none', async () => {
    const db = await freshDb();
    await applyManifest(db, [track('d1'), track('d2')]);
    await db.runAsync("UPDATE tracks SET album_art = 'file:///art/own.jpg' WHERE id = 'd2'");
    await applyArtwork(db, [
      { desktopId: 'd1', uri: 'file:///art/h.jpg' },
      { desktopId: 'd2', uri: 'file:///art/h.jpg' },
    ]);
    const art = await db.getAllAsync<{ album_art: string }>(
      'SELECT album_art FROM tracks ORDER BY id'
    );
    expect(art.map(a => a.album_art)).toEqual(['file:///art/h.jpg', 'file:///art/own.jpg']);
  });

  it('uses a placeholder path a scan never matches', () => {
    expect(pendingPath('d1')).toBe('shiranami-desktop:d1');
    expect(toSqliteTime('not a date')).toBe('not a date');
  });
});
