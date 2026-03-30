import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSleepTimerStore } from './useSleepTimerStore';
import { usePlayerStore } from './usePlayerStore';

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

    it('pauses player when timer reaches 0', () => {
      usePlayerStore.setState({ isPlaying: true });
      useSleepTimerStore.getState().start(1);

      vi.advanceTimersByTime(60 * 1000);

      expect(useSleepTimerStore.getState().remaining).toBe(0);
      expect(useSleepTimerStore.getState().endTime).toBeNull();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('does nothing if endTime is null', () => {
      useSleepTimerStore.getState().tick();
      expect(useSleepTimerStore.getState().remaining).toBe(0);
    });
  });
});
