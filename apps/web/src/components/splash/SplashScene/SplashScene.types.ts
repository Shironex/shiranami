/** A single distant warm window light placed across the skyline band. */
export interface ISplashSceneLight {
  readonly left: string;
  readonly top: string;
  /** Marks one of the two taller windows (slightly taller dot). */
  readonly big?: boolean;
  /** Alternate flicker timing so neighbours don't pulse in lockstep. */
  readonly even?: boolean;
}

export interface ISplashSceneProps {
  /** When true, light flicker is suppressed (reduced-motion or low-perf). */
  readonly reducedMotion: boolean;
}

export interface ISplashSceneView {
  /** When true, the per-light flicker animation is dropped. */
  readonly reducedMotion: boolean;
  /** Distant warm window lights, positioned across the skyline band. */
  readonly lights: readonly ISplashSceneLight[];
}
