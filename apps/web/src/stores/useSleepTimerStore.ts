import { create } from 'zustand';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

export const SLEEP_TIMER_PRESETS = [15, 30, 45, 60, 90] as const;

/** Bounds (in minutes) for the custom sleep-timer duration input. */
export const SLEEP_TIMER_MIN_MINUTES = 1;
export const SLEEP_TIMER_MAX_MINUTES = 600;

interface SleepTimerState {
  /** Timestamp (ms) when the timer expires, or null if inactive */
  endTime: number | null;
  /** Original duration in minutes, for display */
  duration: number | null;
  /** Remaining seconds, updated by the tick interval */
  remaining: number;
}

interface SleepTimerActions {
  start: (minutes: number) => void;
  cancel: () => void;
  tick: () => void;
}

let tickInterval: ReturnType<typeof setInterval> | null = null;

function clearTick() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function startTick() {
  clearTick();
  tickInterval = setInterval(() => {
    useSleepTimerStore.getState().tick();
  }, 1000);
}

export const useSleepTimerStore = create<SleepTimerState & SleepTimerActions>((set, get) => ({
  endTime: null,
  duration: null,
  remaining: 0,

  start: minutes => {
    const endTime = Date.now() + minutes * 60 * 1000;
    set({ endTime, duration: minutes, remaining: minutes * 60 });
    startTick();
  },

  cancel: () => {
    clearTick();
    set({ endTime: null, duration: null, remaining: 0 });
  },

  tick: () => {
    const { endTime } = get();
    if (!endTime) return;

    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));

    if (remaining <= 0) {
      clearTick();
      set({ endTime: null, duration: null, remaining: 0 });
      usePlaybackStore.getState().pause();
    } else {
      set({ remaining });
    }
  },
}));
