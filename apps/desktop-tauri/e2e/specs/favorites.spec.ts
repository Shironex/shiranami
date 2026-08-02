/**
 * Favourites, and the reason they get a spec of their own.
 *
 * `toggleFavorite` is the one mutation in the db namespace that both *reads* and
 * *writes* the row it returns, so it is the one place where the renderer's
 * optimistic copy and the database can disagree without anything throwing. v1
 * shipped a bug of exactly that shape — the heart flipped, the row did not — and
 * the assertion that would have caught it is the one below: toggle through the
 * IPC, then re-read through a *different* call and compare.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell, seedTracks, resetLibrary } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { writeTracks } from '../helpers/audio.js';

const MEDIA = profile('library').mediaDir;

describe('favorites', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  beforeEach(async () => {
    await resetLibrary();
  });

  it('starts every seeded track unfavorited', async () => {
    const files = writeTracks(MEDIA, 2);
    const tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );

    expect(tracks.every(track => track.isFavorite === false)).toBe(true);
    expect(await browser.execute(async () => window.electronAPI.db.tracks.getFavorites())).toEqual(
      []
    );
  });

  it('toggles on, and the row agrees on a fresh read', async () => {
    const files = writeTracks(MEDIA, 2);
    const tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );

    const returned = await browser.execute(
      async id => window.electronAPI.db.tracks.toggleFavorite(id),
      tracks[0].id
    );
    expect(returned.isFavorite).toBe(true);

    // The independent read. `toggleFavorite` returning `true` proves only what
    // the command believed; `getAll` proves what it stored.
    const all = await browser.execute(async () => window.electronAPI.db.tracks.getAll());
    expect(all.find(track => track.id === tracks[0].id)?.isFavorite).toBe(true);
    expect(all.find(track => track.id === tracks[1].id)?.isFavorite).toBe(false);

    const favorites = await browser.execute(async () =>
      window.electronAPI.db.tracks.getFavorites()
    );
    expect(favorites.map(track => track.id)).toEqual([tracks[0].id]);
  });

  it('toggles back off', async () => {
    const files = writeTracks(MEDIA, 1);
    const [track] = await seedTracks([{ title: 'Only', filePath: files[0] }]);

    await browser.execute(async id => window.electronAPI.db.tracks.toggleFavorite(id), track.id);
    const off = await browser.execute(
      async id => window.electronAPI.db.tracks.toggleFavorite(id),
      track.id
    );

    expect(off.isFavorite).toBe(false);
    expect(await browser.execute(async () => window.electronAPI.db.tracks.getFavorites())).toEqual(
      []
    );
  });

  it('survives a reload of the renderer', async () => {
    // The favourite lives in SQLite, not in zustand. Reloading the webview
    // throws away every store in the renderer, so anything still true afterwards
    // came back from the database — which is the actual claim being made.
    const files = writeTracks(MEDIA, 1);
    const [track] = await seedTracks([{ title: 'Persistent', filePath: files[0] }]);
    await browser.execute(async id => window.electronAPI.db.tracks.toggleFavorite(id), track.id);

    await browser.execute(() => {
      window.location.reload();
    });

    await waitForStores();
    await waitForShell();

    const favorites = await browser.execute(async () =>
      window.electronAPI.db.tracks.getFavorites()
    );
    expect(favorites.map(track => track.title)).toEqual(['Persistent']);
  });
});
