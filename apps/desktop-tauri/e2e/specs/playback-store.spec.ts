/**
 * Queue and transport semantics, driven through the store registry.
 *
 * These are the rules an audio engine cannot be asked about directly: what
 * `next()` does at the end of a queue depends on `repeatMode`, and `previous()`
 * means two different things depending on how far into a track you are. v1
 * asserted them the same way — through the store rather than through the
 * transport buttons — because the buttons are a thin call into exactly these
 * actions, and a UI-level test would prove the click handler rather than the
 * rule.
 *
 * Nothing here plays audio. `playback-serve.spec.ts` in the `migrated`
 * capability owns that, because it needs a real file behind a real HTTP range
 * request.
 */

import { browser } from '@wdio/globals';

import {
  waitForStores,
  waitForShell,
  seedTracks,
  resetLibrary,
  setLibraryStore,
  type SeededTrack,
} from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { writeTracks } from '../helpers/audio.js';

const MEDIA = profile('library').mediaDir;

/** Read the whole playback slice the specs assert on, in one round trip. */
async function playbackState() {
  return browser.execute(() => {
    const state = window.__shiranami!.stores.playback.getState();
    return {
      isPlaying: state.isPlaying,
      queueIndex: state.queueIndex,
      queueLength: state.queue.length,
      currentTrackId: state.currentTrack?.id ?? null,
      repeatMode: state.repeatMode,
      currentTime: state.currentTime,
    };
  });
}

/** Put three tracks in the queue, starting at `startIndex`. */
async function queueTracks(tracks: readonly SeededTrack[], startIndex = 0): Promise<void> {
  await browser.execute(
    (rows, index) => {
      window.__shiranami!.stores.playback.getState().setQueue(rows, index);
    },
    tracks as SeededTrack[],
    startIndex
  );
}

describe('playback store', () => {
  let tracks: SeededTrack[];

  before(async () => {
    await waitForStores();
    await waitForShell();
    await resetLibrary();

    const files = writeTracks(MEDIA, 3);
    tracks = await seedTracks(
      files.map((filePath, index) => ({ title: `Track ${index + 1}`, filePath }))
    );
    await setLibraryStore(tracks);
  });

  beforeEach(async () => {
    // Back to a known transport state without re-seeding the library.
    await browser.execute(() => {
      window.__shiranami!.stores.playback.setState({
        repeatMode: 'off',
        currentTime: 0,
        isPlaying: false,
      });
    });
  });

  it('setQueue selects the starting track', async () => {
    await queueTracks(tracks, 1);

    const state = await playbackState();
    expect(state.queueLength).toBe(3);
    expect(state.queueIndex).toBe(1);
    expect(state.currentTrackId).toBe(tracks[1].id);
  });

  it('play, pause and togglePlay move only isPlaying', async () => {
    await queueTracks(tracks, 0);

    await browser.execute(() => window.__shiranami!.stores.playback.getState().play());
    expect((await playbackState()).isPlaying).toBe(true);

    await browser.execute(() => window.__shiranami!.stores.playback.getState().pause());
    expect((await playbackState()).isPlaying).toBe(false);

    await browser.execute(() => window.__shiranami!.stores.playback.getState().togglePlay());
    let state = await playbackState();
    expect(state.isPlaying).toBe(true);
    // The toggle must not have moved the cursor.
    expect(state.queueIndex).toBe(0);
    expect(state.currentTrackId).toBe(tracks[0].id);

    await browser.execute(() => window.__shiranami!.stores.playback.getState().togglePlay());
    state = await playbackState();
    expect(state.isPlaying).toBe(false);
  });

  it('next advances and starts playing', async () => {
    await queueTracks(tracks, 0);

    await browser.execute(() => window.__shiranami!.stores.playback.getState().next());

    const state = await playbackState();
    expect(state.queueIndex).toBe(1);
    expect(state.currentTrackId).toBe(tracks[1].id);
    // `next` is unconditionally a play, even from a paused transport.
    expect(state.isPlaying).toBe(true);
  });

  it('next at the end of the queue stops rather than wrapping', async () => {
    await queueTracks(tracks, 2);
    await browser.execute(() => window.__shiranami!.stores.playback.getState().play());

    await browser.execute(() => window.__shiranami!.stores.playback.getState().next());

    const state = await playbackState();
    // The cursor stays put: repeat is off, so there is nowhere to go.
    expect(state.queueIndex).toBe(2);
    expect(state.currentTrackId).toBe(tracks[2].id);
    expect(state.isPlaying).toBe(false);
  });

  it('next at the end wraps to the first track under repeat-all', async () => {
    await queueTracks(tracks, 2);
    await browser.execute(() => {
      window.__shiranami!.stores.playback.setState({ repeatMode: 'all' });
    });

    await browser.execute(() => window.__shiranami!.stores.playback.getState().next());

    const state = await playbackState();
    expect(state.queueIndex).toBe(0);
    expect(state.currentTrackId).toBe(tracks[0].id);
    expect(state.isPlaying).toBe(true);
  });

  it('previous wraps backwards from the first track', async () => {
    await queueTracks(tracks, 0);

    await browser.execute(() => window.__shiranami!.stores.playback.getState().previous());

    const state = await playbackState();
    expect(state.queueIndex).toBe(2);
    expect(state.currentTrackId).toBe(tracks[2].id);
  });

  it('previous restarts the current track when more than 3s in', async () => {
    // The rule every music player has and nobody documents: `previous` is
    // "restart" until you are near the start of the track. 3s is the store's
    // threshold, so 4 is inside the restart branch and 1 is outside it.
    await queueTracks(tracks, 1);
    await browser.execute(() => window.__shiranami!.stores.playback.getState().seek(4));

    await browser.execute(() => window.__shiranami!.stores.playback.getState().previous());

    let state = await playbackState();
    expect(state.queueIndex).toBe(1);
    expect(state.currentTrackId).toBe(tracks[1].id);
    expect(state.currentTime).toBe(0);

    // Now from just inside the start, the same call is a real step back.
    await browser.execute(() => window.__shiranami!.stores.playback.getState().seek(1));
    await browser.execute(() => window.__shiranami!.stores.playback.getState().previous());

    state = await playbackState();
    expect(state.queueIndex).toBe(0);
    expect(state.currentTrackId).toBe(tracks[0].id);
  });

  it('transport actions are inert on an empty queue', async () => {
    await browser.execute(() => {
      window.__shiranami!.stores.playback.getState().setQueue([], 0);
    });

    await browser.execute(() => {
      const playback = window.__shiranami!.stores.playback.getState();
      playback.next();
      playback.previous();
    });

    const state = await playbackState();
    expect(state.queueLength).toBe(0);
    expect(state.currentTrackId).toBeNull();
  });
});
