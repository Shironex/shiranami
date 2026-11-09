import { Easing, ReduceMotion, type WithTimingConfig } from 'react-native-reanimated';
import { EASE_OUT_EXPO } from '@/lib/theme';

/** Motion lengths in ms. Everything around the app lands between fast and slow. */
export const MOTION = {
  fast: 180,
  base: 240,
  slow: 320,
} as const;

export const easeOutExpo = Easing.bezier(...EASE_OUT_EXPO);

/**
 * A timing config on the app's curve. With the system's reduce motion setting
 * on, Reanimated jumps straight to the end value instead of animating.
 */
export function motion(duration: number = MOTION.base): WithTimingConfig {
  return { duration, easing: easeOutExpo, reduceMotion: ReduceMotion.System };
}
