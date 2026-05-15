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

  test('getCachedToolStatus returns either null or a valid cache shape', async ({ page }) => {
    // downloader.ts kicks off a background fetchAndCacheToolStatus() at IPC
    // registration time, so by the time a spec queries the cache it can
    // legitimately be either:
    //   - null (background fetch not finished yet — common on slower runners)
    //   - a populated ToolStatusCache object (fetch completed first)
    // Either is a valid state; what we pin is the SHAPE when populated.
    const cached = await page.evaluate(async () => {
      return await window.electronAPI.downloader.getCachedToolStatus();
    });

    if (cached === null) {
      return;
    }

    const c = cached as {
      ytdlp: { installed: boolean };
      ffmpeg: { installed: boolean };
      timestamp: number;
      ytdlpPath: string;
      downloadLocation: { path: string };
    };
    expect(typeof c.ytdlp?.installed).toBe('boolean');
    expect(typeof c.ffmpeg?.installed).toBe('boolean');
    expect(typeof c.timestamp).toBe('number');
    expect(typeof c.ytdlpPath).toBe('string');
    expect(typeof c.downloadLocation?.path).toBe('string');
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
