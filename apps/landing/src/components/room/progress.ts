import { MathUtils } from 'three';

/**
 * Shared per-frame state, written by the camera rig and read by the props'
 * animations. `p` is the scroll position in stops: 0 at the hero, 1 at the
 * library, up to 5 at the download stop.
 */
export const room = { p: 0, t: 0 };

/** 1 while the scroll sits on stop `k`, easing to 0 by `reach` stops away. */
export function near(k: number, reach = 0.75): number {
  return MathUtils.smoothstep(1 - Math.abs(room.p - k) / reach, 0, 1);
}

/** 0 before scroll position `from`, 1 after `to`, smooth in between. */
export function ramp(from: number, to: number): number {
  return MathUtils.smoothstep(room.p, from, to);
}
