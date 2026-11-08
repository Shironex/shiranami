import { AppState, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';
import { fadeLevel, sleepStep } from '@/lib/sleep-timer';
import { usePlayerStore } from '@/stores/usePlayerStore';

interface SleepTimerState {
  /** Wall-clock end in ms. A timestamp, not a countdown, so it survives the app sleeping. */
  endsAt: number | null;
  /** Stop when the current track ends instead of at a time. */
  endOfTrack: boolean;
  /** Fade out over the last two minutes. Kept as the default for the next timer. */
  fade: boolean;
  /** Milliseconds left, refreshed on every check, for the UI. */
  remaining: number;
}

interface SleepTimerActions {
  start: (minutes: number, fade: boolean, now?: number) => void;
  startEndOfTrack: (fade: boolean) => void;
  cancel: () => void;
  /**
   * Compares the timer with the clock: applies the fade and pauses playback
   * once it has run out. Safe to call from any tick (the interval, the app
   * coming back, the player's status updates).
   */
  check: (now?: number) => void;
}

export type SleepTimerStore = SleepTimerState & SleepTimerActions;

const TICK_MS = 1000;

let interval: ReturnType<typeof setInterval> | null = null;
let appState: NativeEventSubscription | null = null;

function startTicking() {
  stopTicking();
  interval = setInterval(() => useSleepTimerStore.getState().check(), TICK_MS);
  // JS timers stall while Android keeps the app in the background; catch up
  // as soon as it comes back.
  appState = AppState.addEventListener('change', status => {
    if (status === 'active') useSleepTimerStore.getState().check();
  });
}

function stopTicking() {
  if (interval) clearInterval(interval);
  interval = null;
  appState?.remove();
  appState = null;
}

export function isSleepTimerActive(state: SleepTimerState): boolean {
  return state.endsAt !== null || state.endOfTrack;
}

export const useSleepTimerStore = create<SleepTimerStore>((set, get) => ({
  endsAt: null,
  endOfTrack: false,
  fade: true,
  remaining: 0,

  start: (minutes, fade, now = Date.now()) => {
    usePlayerStore.getState().setStopAfterCurrent(false);
    const remaining = minutes * 60_000;
    set({ endsAt: now + remaining, endOfTrack: false, fade, remaining });
    startTicking();
    get().check(now);
  },

  startEndOfTrack: fade => {
    usePlayerStore.getState().setStopAfterCurrent(true);
    set({ endsAt: null, endOfTrack: true, fade });
    startTicking();
    get().check();
  },

  cancel: () => {
    stopTicking();
    const player = usePlayerStore.getState();
    player.setFade(1);
    if (get().endOfTrack) player.setStopAfterCurrent(false);
    set({ endsAt: null, endOfTrack: false, remaining: 0 });
  },

  check: (now = Date.now()) => {
    const { endsAt, endOfTrack, fade } = get();
    const player = usePlayerStore.getState();

    if (endOfTrack) {
      // The player clears the flag when it pauses at the end of the track.
      if (!player.stopAfterCurrent) {
        get().cancel();
        return;
      }
      const remaining = Math.max(0, (player.duration - player.currentTime) * 1000);
      player.setFade(fadeLevel(remaining, fade));
      set({ remaining });
      return;
    }

    if (endsAt === null) return;
    const step = sleepStep(endsAt, now, fade);
    if (step.expired) {
      player.pause();
      get().cancel();
      return;
    }
    player.setFade(step.level);
    set({ remaining: step.remaining });
  },
}));
