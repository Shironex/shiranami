/**
 * Playlists, through the production IPC.
 *
 * Ported from v1's `playlist-crud.spec.ts`. The assertions are about the
 * *database's* behaviour rather than the UI's: ordering, cascade on delete, and
 * the junction table's response to a track disappearing underneath it. Those are
 * the parts §8 calls unreachable from a unit test, because they live in SQLite's
 * foreign keys rather than in any TypeScript the renderer runs.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell, seedTracks, resetLibrary } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { writeTracks } from '../helpers/audio.js';

const MEDIA = profile('library').mediaDir;

describe('playlist crud', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  beforeEach(async () => {
    await resetLibrary();
  });

  it('creates, renames and deletes a playlist', async () => {
    const created = await browser.execute(async () =>
      window.electronAPI.db.playlists.create({ name: 'Late Night', description: 'rain' })
    );

    expect(created.name).toBe('Late Night');
    expect(created.description).toBe('rain');
    expect(typeof created.id).toBe('string');

    const renamed = await browser.execute(
      async id => window.electronAPI.db.playlists.update(id, { name: 'Early Morning' }),
      created.id
    );
    expect(renamed.name).toBe('Early Morning');
    // The rename must not have created a second row.
    expect(renamed.id).toBe(created.id);

    const afterRename = await browser.execute(async () => window.electronAPI.db.playlists.getAll());
    expect(afterRename).toHaveLength(1);
    expect(afterRename[0].name).toBe('Early Morning');

    await browser.execute(async id => window.electronAPI.db.playlists.delete(id), created.id);

    expect(await browser.execute(async () => window.electronAPI.db.playlists.getAll())).toEqual([]);
  });

  it('creates a playlist with tracks in the order given', async () => {
    const files = writeTracks(MEDIA, 3);
    const tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );

    // Deliberately not the insertion order: a playlist that returned its tracks
    // in `tracks.id` order would pass a same-order assertion by accident.
    const ordered = [tracks[2].id, tracks[0].id, tracks[1].id];

    const playlist = await browser.execute(
      async trackIds =>
        window.electronAPI.db.playlists.createWithTracks({ name: 'Ordered', trackIds }),
      ordered
    );

    const contents = await browser.execute(
      async id => window.electronAPI.db.playlists.getTracks(id),
      playlist.id
    );

    expect(contents.map(track => track.id)).toEqual(ordered);
    expect(contents.map(track => track.title)).toEqual(['Track 3', 'Track 1', 'Track 2']);
  });

  it('adds and removes a single track without disturbing the rest', async () => {
    const files = writeTracks(MEDIA, 3);
    const tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );

    const playlist = await browser.execute(
      async trackIds =>
        window.electronAPI.db.playlists.createWithTracks({ name: 'Mutable', trackIds }),
      [tracks[0].id, tracks[1].id]
    );

    await browser.execute(
      async ([playlistId, trackId]) =>
        window.electronAPI.db.playlists.addTrack(playlistId, trackId),
      [playlist.id, tracks[2].id]
    );

    let contents = await browser.execute(
      async id => window.electronAPI.db.playlists.getTracks(id),
      playlist.id
    );
    expect(contents.map(track => track.id)).toEqual([tracks[0].id, tracks[1].id, tracks[2].id]);

    await browser.execute(
      async ([playlistId, trackId]) =>
        window.electronAPI.db.playlists.removeTrack(playlistId, trackId),
      [playlist.id, tracks[0].id]
    );

    contents = await browser.execute(
      async id => window.electronAPI.db.playlists.getTracks(id),
      playlist.id
    );
    expect(contents.map(track => track.id)).toEqual([tracks[1].id, tracks[2].id]);
  });

  it('drops a deleted track from every playlist that held it', async () => {
    // The junction row has to go with the track. If the foreign key were not
    // cascading, `getTracks` would either still report the dead id or fail its
    // join — and nothing in the renderer would notice until a user pressed play
    // on a row whose file and record were both gone.
    const files = writeTracks(MEDIA, 2);
    const tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );

    const [first, second] = await Promise.all([
      browser.execute(
        async trackIds =>
          window.electronAPI.db.playlists.createWithTracks({ name: 'First', trackIds }),
        [tracks[0].id, tracks[1].id]
      ),
      browser.execute(
        async trackIds =>
          window.electronAPI.db.playlists.createWithTracks({ name: 'Second', trackIds }),
        [tracks[0].id]
      ),
    ]);

    await browser.execute(
      async ids => window.electronAPI.db.tracks.removeMany(ids),
      [tracks[0].id]
    );

    expect(
      await browser.execute(async id => window.electronAPI.db.playlists.getTracks(id), first.id)
    ).toHaveLength(1);
    expect(
      await browser.execute(async id => window.electronAPI.db.playlists.getTracks(id), second.id)
    ).toHaveLength(0);

    // The playlists themselves survive an emptied track list.
    expect(
      await browser.execute(async () => window.electronAPI.db.playlists.getAll())
    ).toHaveLength(2);
  });

  it('deleting a playlist leaves its tracks in the library', async () => {
    const files = writeTracks(MEDIA, 2);
    const tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );

    const playlist = await browser.execute(
      async trackIds =>
        window.electronAPI.db.playlists.createWithTracks({ name: 'Doomed', trackIds }),
      tracks.map(track => track.id)
    );

    await browser.execute(async id => window.electronAPI.db.playlists.delete(id), playlist.id);

    // The cascade must run one way only.
    expect(await browser.execute(async () => window.electronAPI.db.tracks.getAll())).toHaveLength(
      2
    );
  });
});
