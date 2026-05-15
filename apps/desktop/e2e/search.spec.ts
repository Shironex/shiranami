import { test, expect } from './fixtures';
import { seedSilentTracks } from './helpers/db';
import { rmSync } from 'node:fs';

test.describe('library search / filter', () => {
  test('typing in the library search input filters visible rows', async ({ page }) => {
    // Seed tracks with known, distinct titles so we can assert by string.
    const { tracks, audioDir } = await seedSilentTracks(page, 4, { titlePrefix: 'song' });
    // Override with custom titles via raw insertion so we get predictable strings.
    await page.evaluate(
      async ids => {
        const renames = [
          { id: ids[0], data: { title: 'Midnight Drive', artist: 'Echo' } },
          { id: ids[1], data: { title: 'Sunset Boulevard', artist: 'Echo' } },
          { id: ids[2], data: { title: 'Morning Tea', artist: 'Resa' } },
          { id: ids[3], data: { title: 'Quiet Forest', artist: 'Resa' } },
        ];
        for (const r of renames) {
          await window.electronAPI.db.tracks.update(r.id, r.data);
        }
      },
      tracks.map(t => t.id)
    );

    try {
      // Push the seeded rows into the library store so LibraryView renders
      // them. In production this happens via useLibraryActions on scan; the
      // bridge lets us short-circuit it for a deterministic test.
      await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.library));
      await page.evaluate(async () => {
        const rows = await window.electronAPI.db.tracks.getAll();
        const playable = rows.map(r => ({
          id: r.id,
          title: r.title,
          artist: r.artist ?? 'Unknown',
          album: r.album ?? 'Unknown',
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

      // Navigate to the library view via the existing data-view selector
      // that already drives the screenshot script.
      await page.locator('[data-view="library"]').first().click();

      // The search input only renders once the library has rows (LibraryView
      // gates it on `library.length > 0`); wait for it to mount.
      const search = page.getByTestId('library-search-input');
      await search.waitFor({ timeout: 10_000 });

      // Type "sun" → only "Sunset Boulevard" should remain visible.
      await search.fill('sun');

      // The library view renders track titles in row markup; assert the
      // matching title is on-screen and the non-matching one isn't.
      await expect(page.getByText('Sunset Boulevard', { exact: true })).toBeVisible();
      await expect(page.getByText('Quiet Forest', { exact: true })).toHaveCount(0);

      // Search by artist works the same way (the filter checks title +
      // artist + album per LibraryView's filter predicate).
      await search.fill('Resa');
      await expect(page.getByText('Morning Tea', { exact: true })).toBeVisible();
      await expect(page.getByText('Quiet Forest', { exact: true })).toBeVisible();
      await expect(page.getByText('Midnight Drive', { exact: true })).toHaveCount(0);

      // Clear search → all rows visible again.
      await search.fill('');
      for (const title of ['Midnight Drive', 'Sunset Boulevard', 'Morning Tea', 'Quiet Forest']) {
        await expect(page.getByText(title, { exact: true })).toBeVisible();
      }
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });
});
