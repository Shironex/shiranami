import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSleepTimerStore } from './useSleepTimerStore';
import { usePlaybackStore } from './usePlaybackStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

function resetStore() {
  useSleepTimerStore.setState({
    endTime: null,
    duration: null,
    remaining: 0,
  });
  usePlaybackStore.setState({
    isPlaying: false,
    sleepFadeDuration: 8,
    _sleepFading: false,
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
});
