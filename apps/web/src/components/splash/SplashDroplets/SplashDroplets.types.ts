/** A static droplet clinging to the glass, placed in the 760x520 viewBox. */
export interface ISplashDroplet {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** A thin water streak running down the glass — pure motion, self-degrades. */
export interface ISplashStreak {
  readonly left: string;
  readonly duration: string;
  readonly delay: string;
}

/**
 * SplashDroplets renders a fixed condensation pattern, so its props surface is
 * intentionally empty — it exists to keep the per-component contract shape
 * consistent across the feature.
 */
export interface ISplashDropletsProps {}

export interface ISplashDropletsView {
  /** Static clinging droplets. */
  readonly droplets: readonly ISplashDroplet[];
  /** Running water streaks, hidden under reduced-motion / low-perf. */
  readonly streaks: readonly ISplashStreak[];
}
