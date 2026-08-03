import { create } from 'zustand';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWindDownStore } from '@/stores/useWindDownStore';
import { orderQueueCalmestFirst } from '@/lib/windDownQueue';

export const SLEEP_TIMER_PRESETS = [15, 30, 45, 60, 90] as const;

/** Bounds (in minutes) for the custom sleep-timer duration input. */
export const SLEEP_TIMER_MIN_MINUTES = 1;
export const SLEEP_TIMER_MAX_MINUTES = 600;

/** Length of the authored wind-down ending. */
export const WIND_DOWN_MINUTES = 15;

/**
 * The UI dim ramps over this window at the end of a wind-down. Shorter timers
 * (never the built-in wind-down, but a defensive clamp regardless) ramp over
 * their whole length instead.
 */
export const WIND_DOWN_DIM_WINDOW_SECONDS = 10 * 60;

interface SleepTimerState {
  /** Timestamp (ms) when the timer expires, or null if inactive */
  endTime: number | null;
  /** Original duration in minutes, for display */
  duration: number | null;
  /** Remaining seconds, updated by the tick interval */
  remaining: number;
  /**
   * Whether this timer is the authored wind-down ending (dim + calmest-first
   * queue + closing line + next-launch memory) rather than a plain stop-after.
   * Stays true through the expiry fade so the ending can complete, and clears
   * with it.
   */
  windDown: boolean;
}

interface SleepTimerActions {
  start: (minutes: number) => void;
  /**
   * Start the wind-down ending: a fixed-length timer that also reorders the
   * upcoming queue calmest-first (stored LUFS; un-analysed tracks keep their
   * order at the end) so the quietest thing left plays while the listener
   * drifts.
   */
  startWindDown: () => void;
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
  // Abort any in-progress fade-out from a previous timer so it can't pause the
  // newly started playback; this also restores the pre-fade volume.
  clearFade();
  tickInterval = setInterval(() => {
    useSleepTimerStore.getState().tick();
  }, 1000);
}

export const useSleepTimerStore = create<SleepTimerState & SleepTimerActions>((set, get) => ({
  endTime: null,
  duration: null,
  remaining: 0,
  windDown: false,

  start: minutes => {
    // Enforce the bounds at the store boundary so every caller (presets, custom
    // input, any future caller) obeys the same contract, not just the UI.
    const normalized = Math.min(
      SLEEP_TIMER_MAX_MINUTES,
      Math.max(SLEEP_TIMER_MIN_MINUTES, Math.trunc(minutes))
    );
    const endTime = Date.now() + normalized * 60 * 1000;
    // A plain timer replaces any wind-down in flight — its ending with it.
    set({ endTime, duration: normalized, remaining: normalized * 60, windDown: false });
    startTick();
  },

  startWindDown: () => {
    const playback = usePlaybackStore.getState();
    const calmed = orderQueueCalmestFirst(playback.queue, playback.queueIndex);
    // setState (not an action) mirrors how usePlaybackResume restores the
    // queue: only the order of the upcoming tracks changes, so the current
    // track, index and play state all stay exactly where they are.
    usePlaybackStore.setState({ queue: calmed });

    const endTime = Date.now() + WIND_DOWN_MINUTES * 60 * 1000;
    set({
      endTime,
      duration: WIND_DOWN_MINUTES,
      remaining: WIND_DOWN_MINUTES * 60,
      windDown: true,
    });
    startTick();
  },

  cancel: () => {
    clearTick();
    clearFade();
    set({ endTime: null, duration: null, remaining: 0, windDown: false });
  },

  tick: () => {
    const { endTime } = get();
    if (!endTime) return;

    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));

    if (remaining <= 0) {
      clearTick();
      // `windDown` deliberately survives expiry: the overlay holds its dim
      // through the fade, and the completion below decides how it ends.
      set({ endTime: null, duration: null, remaining: 0 });

      const playback = usePlaybackStore.getState();
      // If nothing is playing there's nothing to fade — pause immediately.
      // No wind-down completion either: silence can't drift off.
      if (!playback.isPlaying) {
        playback.pause();
        set({ windDown: false });
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
        const wasWindDown = get().windDown;
        set({ windDown: false });
        // The fade may have been abandoned by a manual pause/resume; if so the
        // engine already cleared the signal — don't pause a resumed user, and
        // don't record an ending that didn't happen.
        if (!state._sleepFading) return;
        state._setSleepFading(false);
        state.pause();
        if (wasWindDown) {
          // The ending genuinely completed: remember the moment (closing line
          // now, "you drifted off at HH:MM" on the next launch).
          useWindDownStore.getState().recordCompletion(state.currentTrack?.title ?? null);
        }
      }, fadeMs);
    } else {
      set({ remaining });
    }
  },
}));
