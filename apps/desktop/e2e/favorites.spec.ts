import { test, expect } from './fixtures';
import { seedSilentTracks } from './helpers/db';
import { rmSync } from 'node:fs';

test.describe('favorites', () => {
  test('toggleFavorite flips isFavorite + getFavorites picks it up', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 3);
    try {
      // No tracks are favourites at seed time — the IPC normalises to false.
      const before = await page.evaluate(async () => {
        return await window.electronAPI.db.tracks.getFavorites();
      });
      expect(before).toHaveLength(0);

      // Toggle one ON.
      const toggled = await page.evaluate(async id => {
        return await window.electronAPI.db.tracks.toggleFavorite(id);
      }, tracks[1].id);
      expect(toggled.isFavorite).toBe(true);

      const afterToggle = await page.evaluate(async () => {
        return await window.electronAPI.db.tracks.getFavorites();
      });
      expect(afterToggle).toHaveLength(1);
      expect(afterToggle[0].id).toBe(tracks[1].id);

      // Toggling again should flip it back OFF — getFavorites empties out.
      await page.evaluate(async id => {
        await window.electronAPI.db.tracks.toggleFavorite(id);
      }, tracks[1].id);

      const afterUntoggle = await page.evaluate(async () => {
        return await window.electronAPI.db.tracks.getFavorites();
      });
      expect(afterUntoggle).toHaveLength(0);
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });

  test('multiple favorites are returned in the order the DB picks them', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 5);
    try {
      // Favourite three of the five.
      const targetIds = [tracks[0].id, tracks[2].id, tracks[4].id];
      await page.evaluate(async ids => {
        for (const id of ids) {
          await window.electronAPI.db.tracks.toggleFavorite(id);
        }
      }, targetIds);

      const favs = await page.evaluate(async () => {
        return await window.electronAPI.db.tracks.getFavorites();
      });

      expect(favs).toHaveLength(3);
      // Don't assert order — the IPC sorts by its own rule. Use a set.
      const favIds = new Set(favs.map(f => f.id));
      for (const id of targetIds) {
        expect(favIds.has(id)).toBe(true);
      }
      expect(favs.every(f => f.isFavorite === true)).toBe(true);
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });
});
