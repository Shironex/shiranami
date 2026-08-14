import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSleepTimerStore, WIND_DOWN_MINUTES } from './useSleepTimerStore';
import { usePlaybackStore } from './usePlaybackStore';
import { useWindDownStore } from './useWindDownStore';
import type { Track } from './types';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

function makeTrack(id: string, loudnessLufs: number | null, album = 'Nocturne'): Track {
  return {
    id,
    title: id,
    artist: 'Aoi',
    album,
    duration: 200,
    filePath: `/music/${id}.mp3`,
    loudnessLufs,
  };
}

function resetStore() {
  useSleepTimerStore.setState({
    endTime: null,
    duration: null,
    remaining: 0,
    windDown: false,
    stopMode: null,
  });
  usePlaybackStore.setState({
    isPlaying: false,
    sleepFadeDuration: 8,
    _sleepFading: false,
    queue: [],
    queueIndex: -1,
    currentTrack: null,
    repeatMode: 'off',
  });
  useWindDownStore.setState({
    lastCompletion: null,
    noteAcknowledged: false,
    closingLineUntil: null,
  });
}

describe('useSleepTimerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    useSleepTimerStore.getState().cancel();
    vi.useRealTimers();
  });

  describe('start', () => {
    it('sets endTime, duration, and remaining', () => {
      const now = Date.now();
      useSleepTimerStore.getState().start(15);
      const s = useSleepTimerStore.getState();
      expect(s.duration).toBe(15);
      expect(s.remaining).toBe(15 * 60);
      expect(s.endTime).toBeGreaterThanOrEqual(now + 15 * 60 * 1000 - 10);
    });

    it('starts an interval that calls tick', () => {
      useSleepTimerStore.getState().start(1);
      const initialRemaining = useSleepTimerStore.getState().remaining;

      vi.advanceTimersByTime(2000);

      expect(useSleepTimerStore.getState().remaining).toBeLessThan(initialRemaining);
    });

    it('clamps and truncates out-of-range or fractional minutes', () => {
      useSleepTimerStore.getState().start(0);
      expect(useSleepTimerStore.getState().duration).toBe(1); // clamped to min

      useSleepTimerStore.getState().start(9999);
      expect(useSleepTimerStore.getState().duration).toBe(600); // clamped to max

      useSleepTimerStore.getState().start(12.9);
      expect(useSleepTimerStore.getState().duration).toBe(12); // truncated
    });
  });

  describe('cancel', () => {
    it('clears all timer state', () => {
      useSleepTimerStore.getState().start(10);
      useSleepTimerStore.getState().cancel();
      const s = useSleepTimerStore.getState();
      expect(s.endTime).toBeNull();
      expect(s.duration).toBeNull();
      expect(s.remaining).toBe(0);
    });
  });

  describe('tick', () => {
    it('decrements remaining over time', () => {
      useSleepTimerStore.getState().start(1);

      vi.advanceTimersByTime(5000);

      const s = useSleepTimerStore.getState();
      expect(s.remaining).toBe(55);
    });

    it('fades out then pauses player when timer reaches 0', () => {
      usePlaybackStore.setState({ isPlaying: true, sleepFadeDuration: 8 });
      useSleepTimerStore.getState().start(1);

      vi.advanceTimersByTime(60 * 1000);

      // Timer expired and started the fade — but playback has NOT paused yet.
      expect(useSleepTimerStore.getState().remaining).toBe(0);
      expect(useSleepTimerStore.getState().endTime).toBeNull();
      expect(usePlaybackStore.getState()._sleepFading).toBe(true);
      expect(usePlaybackStore.getState().isPlaying).toBe(true);

      // After the fade window, playback pauses and the fade signal clears.
      vi.advanceTimersByTime(8 * 1000);
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
      expect(usePlaybackStore.getState()._sleepFading).toBe(false);
    });

    it('pauses immediately without fading when nothing is playing', () => {
      usePlaybackStore.setState({ isPlaying: false });
      useSleepTimerStore.getState().start(1);

      vi.advanceTimersByTime(60 * 1000);

      expect(usePlaybackStore.getState()._sleepFading).toBe(false);
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });

    it('cancelling during the fade aborts the deferred pause', () => {
      usePlaybackStore.setState({ isPlaying: true, sleepFadeDuration: 8 });
      useSleepTimerStore.getState().start(1);

      vi.advanceTimersByTime(60 * 1000);
      expect(usePlaybackStore.getState()._sleepFading).toBe(true);

      useSleepTimerStore.getState().cancel();
      expect(usePlaybackStore.getState()._sleepFading).toBe(false);

      // The deferred pause must not fire after cancellation.
      vi.advanceTimersByTime(8 * 1000);
      expect(usePlaybackStore.getState().isPlaying).toBe(true);
    });

    it('does not pause a resumed user when the fade was abandoned', () => {
      usePlaybackStore.setState({ isPlaying: true, sleepFadeDuration: 8 });
      useSleepTimerStore.getState().start(1);

      vi.advanceTimersByTime(60 * 1000);
      expect(usePlaybackStore.getState()._sleepFading).toBe(true);

      // Simulate a manual pause + resume mid-fade: the audio engine clears the
      // fade signal on the manual pause, and the user resumes playback.
      usePlaybackStore.setState({ _sleepFading: false, isPlaying: true });

      // The dangling deferred-pause timer must not stop the resumed user.
      vi.advanceTimersByTime(8 * 1000);
      expect(usePlaybackStore.getState().isPlaying).toBe(true);
    });

    it('does nothing if endTime is null', () => {
      useSleepTimerStore.getState().tick();
      expect(useSleepTimerStore.getState().remaining).toBe(0);
    });
  });

  describe('boundary stop modes', () => {
    /** Seed a playing queue: [same-album, same-album, other-album]. */
    function seedQueue(queueIndex: number) {
      const queue = [makeTrack('a1', -10), makeTrack('a2', -12), makeTrack('b1', -14, 'Daybreak')];
      usePlaybackStore.setState({
        queue,
        queueIndex,
        currentTrack: queue[queueIndex],
        isPlaying: true,
      });
    }

    it('arming a boundary stop replaces a running timed timer', () => {
      useSleepTimerStore.getState().start(30);
      useSleepTimerStore.getState().startStopAfter('track');

      const s = useSleepTimerStore.getState();
      expect(s.stopMode).toBe('track');
      expect(s.endTime).toBeNull();
      expect(s.duration).toBeNull();
      expect(s.remaining).toBe(0);

      // The replaced timer's tick is gone: nothing expires later.
      vi.advanceTimersByTime(31 * 60 * 1000);
      expect(useSleepTimerStore.getState().stopMode).toBe('track');
    });

    it('a timed timer or wind-down started afterwards disarms the boundary stop', () => {
      useSleepTimerStore.getState().startStopAfter('album');
      useSleepTimerStore.getState().start(15);
      expect(useSleepTimerStore.getState().stopMode).toBeNull();

      useSleepTimerStore.getState().startStopAfter('album');
      useSleepTimerStore.getState().startWindDown();
      expect(useSleepTimerStore.getState().stopMode).toBeNull();
    });

    it('cancel disarms the boundary stop', () => {
      useSleepTimerStore.getState().startStopAfter('track');
      useSleepTimerStore.getState().cancel();
      expect(useSleepTimerStore.getState().stopMode).toBeNull();
    });

    it('stopsAtBoundary is false when nothing is armed', () => {
      seedQueue(0);
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(false);
    });

    it('end-of-track fires at every track end', () => {
      seedQueue(0);
      useSleepTimerStore.getState().startStopAfter('track');
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(true);
    });

    it('end-of-album holds while the next track is on the same album', () => {
      seedQueue(0);
      useSleepTimerStore.getState().startStopAfter('album');
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(false);
    });

    it('end-of-album fires when the next track is a different album', () => {
      seedQueue(1);
      useSleepTimerStore.getState().startStopAfter('album');
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(true);
    });

    it('end-of-album fires when the queue runs out', () => {
      seedQueue(2);
      useSleepTimerStore.getState().startStopAfter('album');
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(true);
    });

    it('end-of-album follows the repeat-all wrap back to the queue head', () => {
      // Last track ('Daybreak') wraps to the first ('Nocturne') — different
      // albums, so the boundary stop fires at the wrap.
      seedQueue(2);
      usePlaybackStore.setState({ repeatMode: 'all' });
      useSleepTimerStore.getState().startStopAfter('album');
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(true);

      // Same-album wrap: a queue that is all one album never leaves it, except
      // that the wrap from its last track back to its first is still the
      // album's end.
      const oneAlbum = [makeTrack('a1', -10), makeTrack('a2', -12)];
      usePlaybackStore.setState({
        queue: oneAlbum,
        queueIndex: 0,
        currentTrack: oneAlbum[0],
        repeatMode: 'all',
      });
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(false);
    });

    it('end-of-album fires at the track end under repeat-one', () => {
      // Repeat-one loops the current track forever — the album would never
      // end, so the only boundary there is has to count.
      seedQueue(0);
      usePlaybackStore.setState({ repeatMode: 'one' });
      useSleepTimerStore.getState().startStopAfter('album');
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(true);
    });

    it('completeBoundaryStop pauses playback and disarms', () => {
      seedQueue(0);
      useSleepTimerStore.getState().startStopAfter('track');
      useSleepTimerStore.getState().completeBoundaryStop();

      expect(useSleepTimerStore.getState().stopMode).toBeNull();
      expect(useSleepTimerStore.getState().stopsAtBoundary()).toBe(false);
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });
  });

  describe('wind down', () => {
    it('starts a wind-down timer with the authored length', () => {
      useSleepTimerStore.getState().startWindDown();

      const s = useSleepTimerStore.getState();
      expect(s.windDown).toBe(true);
      expect(s.duration).toBe(WIND_DOWN_MINUTES);
      expect(s.remaining).toBe(WIND_DOWN_MINUTES * 60);
      expect(s.endTime).not.toBeNull();
    });

    it('reorders the upcoming queue calmest-first without touching the current track', () => {
      const queue = [
        makeTrack('played', -5),
        makeTrack('current', -10),
        makeTrack('loud', -7),
        makeTrack('unknown', null),
        makeTrack('calm', -21),
      ];
      usePlaybackStore.setState({ queue, queueIndex: 1, currentTrack: queue[1], isPlaying: true });

      useSleepTimerStore.getState().startWindDown();

      const playback = usePlaybackStore.getState();
      expect(playback.queue.map(t => t.id)).toEqual([
        'played',
        'current',
        'calm',
        'loud',
        'unknown',
      ]);
      expect(playback.queueIndex).toBe(1);
      expect(playback.currentTrack?.id).toBe('current');
      expect(playback.isPlaying).toBe(true);
    });

    it('a plain preset started afterwards drops the wind-down mode', () => {
      useSleepTimerStore.getState().startWindDown();
      useSleepTimerStore.getState().start(30);

      expect(useSleepTimerStore.getState().windDown).toBe(false);
    });

    it('records the completion (with the carrying track) once the fade runs out', () => {
      const track = makeTrack('carrying', -18);
      usePlaybackStore.setState({
        isPlaying: true,
        sleepFadeDuration: 8,
        queue: [track],
        queueIndex: 0,
        currentTrack: track,
      });

      useSleepTimerStore.getState().startWindDown();
      vi.advanceTimersByTime(WIND_DOWN_MINUTES * 60 * 1000);

      // Expired into the fade: the mode survives so the dim can hold.
      expect(useSleepTimerStore.getState().windDown).toBe(true);
      expect(useWindDownStore.getState().lastCompletion).toBeNull();

      vi.advanceTimersByTime(8 * 1000);

      const windDown = useWindDownStore.getState();
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
      expect(useSleepTimerStore.getState().windDown).toBe(false);
      expect(windDown.lastCompletion?.trackTitle).toBe('carrying');
      expect(windDown.noteAcknowledged).toBe(false);
      expect(windDown.closingLineUntil).not.toBeNull();
    });

    it('records nothing when the timer expires over silence', () => {
      usePlaybackStore.setState({ isPlaying: false });

      useSleepTimerStore.getState().startWindDown();
      vi.advanceTimersByTime(WIND_DOWN_MINUTES * 60 * 1000);

      expect(useSleepTimerStore.getState().windDown).toBe(false);
      expect(useWindDownStore.getState().lastCompletion).toBeNull();
    });

    it('records nothing when cancelled mid-fade', () => {
      usePlaybackStore.setState({ isPlaying: true, sleepFadeDuration: 8 });

      useSleepTimerStore.getState().startWindDown();
      vi.advanceTimersByTime(WIND_DOWN_MINUTES * 60 * 1000);
      useSleepTimerStore.getState().cancel();
      vi.advanceTimersByTime(8 * 1000);

      expect(useSleepTimerStore.getState().windDown).toBe(false);
      expect(useWindDownStore.getState().lastCompletion).toBeNull();
      expect(usePlaybackStore.getState().isPlaying).toBe(true);
    });

    it('records nothing when a manual resume abandons the fade', () => {
      usePlaybackStore.setState({ isPlaying: true, sleepFadeDuration: 8 });

      useSleepTimerStore.getState().startWindDown();
      vi.advanceTimersByTime(WIND_DOWN_MINUTES * 60 * 1000);
      expect(usePlaybackStore.getState()._sleepFading).toBe(true);

      // The audio engine clears the signal on a manual pause/resume mid-fade.
      usePlaybackStore.setState({ _sleepFading: false, isPlaying: true });
      vi.advanceTimersByTime(8 * 1000);

      expect(useSleepTimerStore.getState().windDown).toBe(false);
      expect(useWindDownStore.getState().lastCompletion).toBeNull();
      expect(usePlaybackStore.getState().isPlaying).toBe(true);
    });
  });
});
