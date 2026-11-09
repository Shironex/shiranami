import { useEffect } from 'react';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { karaokeElapsed, karaokeNeedsResync } from '@/lib/lyrics-sync';
import { usePlayerStore } from '@/stores/usePlayerStore';

/**
 * Seconds into the sung line, as a shared value the karaoke fill reads on the
 * UI thread. It runs on its own linear clock from the player's position, so
 * the fill moves every frame although the player reports only twice a second.
 * It holds while paused, and restarts from the real position on every seek
 * (`seekCount`, which repeat one also bumps) and whenever the position strays.
 */
export function useKaraokeClock(
  lineTime: number,
  duration: number,
  enabled: boolean
): SharedValue<number> {
  const elapsed = useSharedValue(0);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const seekCount = usePlayerStore(s => s.seekCount);

  useEffect(() => {
    if (!enabled) return;
    const restart = (currentTime: number) => {
      const from = karaokeElapsed(currentTime, lineTime, duration);
      cancelAnimation(elapsed);
      elapsed.value = from;
      if (isPlaying && from < duration) {
        elapsed.value = withTiming(duration, {
          duration: (duration - from) * 1000,
          easing: Easing.linear,
        });
      }
    };
    restart(usePlayerStore.getState().currentTime);

    const unsubscribe = usePlayerStore.subscribe((state, prev) => {
      if (state.currentTime === prev.currentTime) return;
      if (karaokeNeedsResync(elapsed.value, state.currentTime, lineTime, duration)) {
        restart(state.currentTime);
      }
    });
    return () => {
      unsubscribe();
      cancelAnimation(elapsed);
    };
  }, [enabled, lineTime, duration, isPlaying, seekCount, elapsed]);

  return elapsed;
}
