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
let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

function clearTick() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

/**
 * Abort an in-progress fade-out: clear the pending deferred-pause and tell the
 * audio engine to stop (and restore) the gain ramp. Safe to call when no fade
 * is active.
 */
function clearFade() {
  if (fadeTimeout) {
    clearTimeout(fadeTimeout);
    fadeTimeout = null;
  }
  if (usePlaybackStore.getState()._sleepFading) {
    usePlaybackStore.getState()._setSleepFading(false);
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
    // Enforce the bounds at the store boundary so every caller (presets, custom
    // input, any future caller) obeys the same contract, not just the UI.
    const normalized = Math.min(
      SLEEP_TIMER_MAX_MINUTES,
      Math.max(SLEEP_TIMER_MIN_MINUTES, Math.trunc(minutes))
    );
    const endTime = Date.now() + normalized * 60 * 1000;
    set({ endTime, duration: normalized, remaining: normalized * 60 });
    startTick();
  },

  cancel: () => {
    clearTick();
    clearFade();
    set({ endTime: null, duration: null, remaining: 0 });
  },

  tick: () => {
    const { endTime } = get();
    if (!endTime) return;

    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));

    if (remaining <= 0) {
      clearTick();
      set({ endTime: null, duration: null, remaining: 0 });

      const playback = usePlaybackStore.getState();
      // If nothing is playing there's nothing to fade — pause immediately.
      if (!playback.isPlaying) {
        playback.pause();
        return;
      }

      // Gentle equal-power fade-out to silence, then pause. The audio engine
      // performs the audible gain ramp while `_sleepFading` is true and
      // restores the prior volume once playback stops, so the next play isn't
      // silent.
      const fadeMs = playback.sleepFadeDuration * 1000;
      playback._setSleepFading(true);
      fadeTimeout = setTimeout(() => {
        fadeTimeout = null;
        const state = usePlaybackStore.getState();
        // The fade may have been abandoned by a manual pause/resume; if so the
        // engine already cleared the signal — don't pause a resumed user.
        if (!state._sleepFading) return;
        state._setSleepFading(false);
        state.pause();
      }, fadeMs);
    } else {
      set({ remaining });
    }
  },
}));
