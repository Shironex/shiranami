import { test, expect } from './fixtures';
import { seedSilentTracks } from './helpers/db';
import { rmSync } from 'node:fs';

// Convert a seeded track row into the shape usePlaybackStore expects.
// Matches `Track` from apps/web/src/stores/types.ts; only the fields we
// actually need are populated.
function asPlayableTrack(
  row: { id: string; title: string; filePath: string; artist: string | null; album: string | null },
  index: number
) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist ?? 'Test Artist',
    album: row.album ?? 'Test Album',
    duration: 1,
    filePath: row.filePath,
    trackNumber: index + 1,
    isFavorite: false,
    playCount: 0,
  };
}

test.describe('playback state machine', () => {
  test('setQueue → play → pause → next → previous', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 3);
    try {
      // The bridge mounts via dynamic import; React effects fire after
      // hydration, so wait until the registry is online.
      await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.playback));

      const queue = tracks.map(asPlayableTrack);

      // setQueue auto-plays — that's the production behaviour. Asserting
      // it explicitly here lets a future contract change (e.g. "queue but
      // don't play") fail this test instead of silently shipping.
      const afterSet = await page.evaluate(q => {
        const store = window.__shiranami!.stores.playback;
        store.getState().setQueue(q, 0);
        const s = store.getState();
        return {
          queueLength: s.queue.length,
          queueIndex: s.queueIndex,
          currentTrackId: s.currentTrack?.id ?? null,
          isPlaying: s.isPlaying,
        };
      }, queue);
      expect(afterSet.queueLength).toBe(3);
      expect(afterSet.queueIndex).toBe(0);
      expect(afterSet.currentTrackId).toBe(tracks[0].id);
      expect(afterSet.isPlaying).toBe(true);

      // pause() flips isPlaying without touching the index.
      const afterPause = await page.evaluate(() => {
        const store = window.__shiranami!.stores.playback;
        store.getState().pause();
        const s = store.getState();
        return { isPlaying: s.isPlaying, queueIndex: s.queueIndex };
      });
      expect(afterPause.isPlaying).toBe(false);
      expect(afterPause.queueIndex).toBe(0);

      // play() flips it back.
      const afterPlay = await page.evaluate(() => {
        const store = window.__shiranami!.stores.playback;
        store.getState().play();
        return store.getState().isPlaying;
      });
      expect(afterPlay).toBe(true);

      // next() advances index + currentTrack and keeps playing.
      const afterNext = await page.evaluate(() => {
        const store = window.__shiranami!.stores.playback;
        store.getState().next();
        const s = store.getState();
        return {
          queueIndex: s.queueIndex,
          currentTrackId: s.currentTrack?.id ?? null,
          isPlaying: s.isPlaying,
        };
      });
      expect(afterNext.queueIndex).toBe(1);
      expect(afterNext.currentTrackId).toBe(tracks[1].id);
      expect(afterNext.isPlaying).toBe(true);

      // next() again → last track.
      const afterSecondNext = await page.evaluate(() => {
        const store = window.__shiranami!.stores.playback;
        store.getState().next();
        const s = store.getState();
        return { queueIndex: s.queueIndex, currentTrackId: s.currentTrack?.id ?? null };
      });
      expect(afterSecondNext.queueIndex).toBe(2);
      expect(afterSecondNext.currentTrackId).toBe(tracks[2].id);

      // previous() rewinds. With currentTime at 0 the store treats it as a
      // skip-back rather than a restart-current.
      const afterPrev = await page.evaluate(() => {
        const store = window.__shiranami!.stores.playback;
        store.getState().previous();
        const s = store.getState();
        return { queueIndex: s.queueIndex, currentTrackId: s.currentTrack?.id ?? null };
      });
      expect(afterPrev.queueIndex).toBe(1);
      expect(afterPrev.currentTrackId).toBe(tracks[1].id);
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });

  test('togglePlay() flips isPlaying both directions', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 1);
    try {
      await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.playback));

      const result = await page.evaluate(
        queue => {
          const store = window.__shiranami!.stores.playback;
          store.getState().setQueue(queue, 0); // auto-plays
          store.getState().pause(); // explicit pause so the test is reading from a known state
          const before = store.getState().isPlaying;
          // togglePlay isn't on the bridge type yet; access via unknown cast.
          (store.getState() as unknown as { togglePlay: () => void }).togglePlay();
          const afterFirst = store.getState().isPlaying;
          (store.getState() as unknown as { togglePlay: () => void }).togglePlay();
          const afterSecond = store.getState().isPlaying;
          return { before, afterFirst, afterSecond };
        },
        [asPlayableTrack(tracks[0], 0)]
      );

      expect(result.before).toBe(false);
      expect(result.afterFirst).toBe(true);
      expect(result.afterSecond).toBe(false);
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });

  test('setQueue with startIndex jumps directly to that track', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 4);
    try {
      await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.playback));

      const result = await page.evaluate(queue => {
        const store = window.__shiranami!.stores.playback;
        store.getState().setQueue(queue, 2);
        const s = store.getState();
        return { queueIndex: s.queueIndex, currentTrackId: s.currentTrack?.id ?? null };
      }, tracks.map(asPlayableTrack));

      expect(result.queueIndex).toBe(2);
      expect(result.currentTrackId).toBe(tracks[2].id);
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });

  test('next() past the end of queue stops playback when repeatMode is off', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 2);
    try {
      await page.waitForFunction(() => Boolean(window.__shiranami?.stores?.playback));

      const result = await page.evaluate(queue => {
        const store = window.__shiranami!.stores.playback;
        store.getState().setQueue(queue, 0);
        store.getState().next(); // → index 1
        store.getState().next(); // → past end, stops
        const s = store.getState();
        return { queueIndex: s.queueIndex, isPlaying: s.isPlaying, repeatMode: s.repeatMode };
      }, tracks.map(asPlayableTrack));

      expect(result.repeatMode).toBe('off');
      // Index doesn't advance past end; isPlaying is set to false.
      expect(result.queueIndex).toBe(1);
      expect(result.isPlaying).toBe(false);
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });
});
