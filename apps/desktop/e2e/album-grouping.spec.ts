import { test, expect } from './fixtures';
import { seedTracks } from './helpers/db';
import { createSilentAudioFiles } from './helpers/audio-fixtures';
import { rmSync } from 'node:fs';

test.describe('album grouping', () => {
  // Regression guard for #269. An untagged various-artists compilation — same
  // album title, different track artists, no album-artist tag — must render as
  // ONE album, not fragment into one album per artist. v0.22.0 keyed grouping
  // on (albumArtist || artist, album); for untagged comps the `|| artist`
  // fallback resolved per track and split the album. The fix keys untagged
  // albums on the title alone, so the three tracks collapse into one card.
  test('untagged various-artists album stays one album (#269)', async ({ page }) => {
    const { dir, files } = createSilentAudioFiles(3);
    try {
      // Three tracks, one album title, three distinct artists, NO albumArtist.
      // seedTracks omits albumArtist, so the rows persist album_artist = NULL —
      // exactly the "untagged" state the fix has to group by title.
      await seedTracks(page, [
        { filePath: files[0].filePath, title: 'One', artist: 'Alice', album: 'Lofi Mix' },
        { filePath: files[1].filePath, title: 'Two', artist: 'Bob', album: 'Lofi Mix' },
        { filePath: files[2].filePath, title: 'Three', artist: 'Carol', album: 'Lofi Mix' },
      ]);

      // Bridge the seeded rows into the library store so LibraryView renders
      // them (mirrors search.spec — production fills the store on scan).
      await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.library));
      await page.evaluate(async () => {
        const rows = await window.electronAPI.db.tracks.getAll();
        const playable = rows.map(r => ({
          id: r.id,
          title: r.title,
          artist: r.artist ?? 'Unknown',
          album: r.album ?? 'Unknown',
          albumArtist: r.albumArtist ?? null,
          duration: r.duration ?? 1,
          filePath: r.filePath,
          isFavorite: r.isFavorite,
          playCount: r.playCount,
        }));
        const store = window.__shiranami!.stores.library as unknown as {
          getState: () => { setLibrary: (tracks: unknown[]) => void };
        };
        store.getState().setLibrary(playable);
      });

      // Library view → Albums mode (default mode is 'tracks').
      await page.locator('[data-view="library"]').first().click();
      await page.getByRole('button', { name: 'Albums', exact: true }).click();

      // The discriminator: one "Lofi Mix" card, not three. The single card
      // aggregates the distinct track artists in encounter order.
      await expect(page.getByText('Lofi Mix', { exact: true })).toHaveCount(1);
      await expect(page.getByText('Alice, Bob, Carol', { exact: true })).toBeVisible();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
