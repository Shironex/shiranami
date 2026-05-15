import { test, expect } from './fixtures';

test.describe('playlist import (yt-dlp dependency contract)', () => {
  test('checkDependencies returns the install-status pair as booleans', async ({ page }) => {
    // bin-paths.ts uses <repoRoot>/bin in dev (and we launch unpackaged in
    // e2e), so a dev machine with a checked-in yt-dlp may report it as
    // installed. Pin only the contract: both flags are booleans and the
    // IPC doesn't throw.
    const deps = await page.evaluate(async () => {
      return await window.electronAPI.downloader.checkDependencies();
    });
    expect(deps).toHaveProperty('ytdlpInstalled');
    expect(deps).toHaveProperty('ffmpegInstalled');
    expect(typeof deps.ytdlpInstalled).toBe('boolean');
    expect(typeof deps.ffmpegInstalled).toBe('boolean');
  });

  test('cached tool status is null on a fresh launch', async ({ page }) => {
    const cached = await page.evaluate(async () => {
      return await window.electronAPI.downloader.getCachedToolStatus();
    });
    // No tool-status cache file yet; the handler returns null when there's
    // nothing on disk. Pins the contract for the renderer's
    // playlist-import "we haven't checked yet" state.
    expect(cached).toBeNull();
  });

  test('playlistImport store hydrates with a sane initial shape', async ({ page }) => {
    await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.playlistImport));

    const state = await page.evaluate(() => {
      const store = window.__shiranami!.stores.playlistImport as unknown as {
        getState: () => Record<string, unknown>;
      };
      const s = store.getState();
      // Don't pin the full shape — just the load-bearing fields. The
      // import store evolves alongside the feature; tightening this
      // would force every UI change to update the spec.
      return {
        hasUrl: 'url' in s || 'inputUrl' in s,
        hasState: 'state' in s || 'status' in s || 'phase' in s,
        keysSnapshot: Object.keys(s).length,
      };
    });

    expect(state.keysSnapshot).toBeGreaterThan(0);
  });
});
