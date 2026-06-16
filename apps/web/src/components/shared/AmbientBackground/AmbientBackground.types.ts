export interface IAmbientBackgroundView {
  /** Low-performance mode disables the whole layer (the shell renders nothing). */
  readonly enabled: boolean;
  /** Render the grain/noise overlay. */
  readonly showNoiseOverlay: boolean;
  /** Render the album-art glow (only when a track is playing). */
  readonly showGlow: boolean;
  /** Stable key for the glow element — changes the cross-fade when the color changes. */
  readonly glowKey: string;
  /** Pre-built radial-gradient `background` string derived from the ambient color. */
  readonly glowBackground: string;
  /** Cross-fade duration in seconds (0 under prefers-reduced-motion). */
  readonly transitionDuration: number;
}
