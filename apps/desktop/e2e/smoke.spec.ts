import { test, expect } from './fixtures';

test.describe('smoke', () => {
  test('launches the app and renders the library shell', async ({ page, electronApp }) => {
    // The library nav button is the same `[data-view="library"]` selector the
    // screenshot script waits on. If it's visible we have a working chain of
    // main process → preload bridge → React renderer.
    await expect(page.locator('[data-view="library"]').first()).toBeVisible({
      timeout: 30_000,
    });

    expect(electronApp.windows().length).toBeGreaterThan(0);
  });

  test('exposes the production preload bridge', async ({ page }) => {
    // `window.electronAPI.platform` is the cheapest "is the bridge wired?"
    // assertion — purely synchronous, no IPC round-trip needed.
    const platform = await page.evaluate(() => window.electronAPI?.platform);
    expect(platform).toMatch(/^(darwin|win32|linux)$/);
  });

  test('starts with an empty library and no playlists', async ({ page }) => {
    // Fresh userDataDir → fresh sqlite → zero rows. Validates the per-worker
    // isolation contract from helpers/launch.ts; if a stale shiranami.db
    // leaked through, this spec is what catches it.
    const counts = await page.evaluate(async () => ({
      tracks: (await window.electronAPI.db.tracks.getAll()).length,
      playlists: (await window.electronAPI.db.playlists.getAll()).length,
      folders: (await window.electronAPI.db.folders.getAll()).length,
    }));
    expect(counts).toEqual({ tracks: 0, playlists: 0, folders: 0 });
  });
});
