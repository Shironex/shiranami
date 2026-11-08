import { sleepLabel } from '@/lib/sleep-timer';
import { isSleepTimerActive, useSleepTimerStore } from '@/stores/useSleepTimerStore';

/** "24 min" or "End of song" while a sleep timer runs, otherwise null. */
export function useSleepLabel(): string | null {
  return useSleepTimerStore(state => {
    if (!isSleepTimerActive(state)) return null;
    return state.endOfTrack ? 'End of song' : sleepLabel(state.remaining);
  });
}
