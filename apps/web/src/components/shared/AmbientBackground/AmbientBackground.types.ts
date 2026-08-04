export interface IArtBloomLayer {
  /** Square edge length of the cover copy (viewport-relative unit string). */
  readonly size: string;
  /** Anchor point of the layer, as viewport percentages. */
  readonly top: string;
  readonly left: string;
  /** Blur radius — viewport-scaled so 4K doesn't read grainy. */
  readonly blur: string;
  /** Saturation boost pushing the blurred cover into light. */
  readonly saturate: number;
  /** Steady-state opacity of the layer. */
  readonly opacity: number;
  /** Full-rotation period in seconds (minutes-scale on purpose). */
  readonly duration: number;
  /** Counter-rotation flag — alternating layers spin opposite ways. */
  readonly reverse: boolean;
  /** Off-center transform-origin that turns the spin into a slow orbit. */
  readonly origin: string;
}

/**
 * The two-slot bloom crossfader: at most one incoming and one outgoing cover.
 * A track change moves `current` into `previous` (replacing — never queueing —
 * whatever was already fading out), so a rapid five-track skip renders two
 * layers, not five.
 */
export interface IArtBloomSlots {
  readonly current: string | null;
  readonly previous: string | null;
}

export interface IAmbientBackgroundView {
  /** Low-performance mode disables the whole layer (the shell renders nothing). */
  readonly enabled: boolean;
  /** Render the grain/noise overlay. */
  readonly showNoiseOverlay: boolean;
  /** The bloom crossfader slots (cover URLs, content-addressed). */
  readonly bloomSlots: IArtBloomSlots;
  /** Bloom cross-dissolve window in seconds — the audio crossfade's when it is
   *  enabled, a calm default otherwise, 0 under reduced motion. */
  readonly artFadeDuration: number;
  /** The outgoing cover finished dissolving — release its slot. */
  readonly onPreviousBloomDone: () => void;
  /** Render the color-glow fallback (a playing track without cover art). */
  readonly showGlow: boolean;
  /** Stable key for the glow element — changes the cross-fade when the color changes. */
  readonly glowKey: string;
  /** Pre-built radial-gradient `background` string derived from the ambient color. */
  readonly glowBackground: string;
  /** Cross-fade duration in seconds (0 under prefers-reduced-motion). */
  readonly transitionDuration: number;
  /** Current track id the bloom pulse is keyed to — a change replays the pulse. */
  readonly bloomKey: string | undefined;
  /** Play the brief track-change glow "bloom" (off under reduced motion). */
  readonly showBloom: boolean;
  /** Tempo-locked breathing engages (BPM known, toggle on, motion allowed). */
  readonly breathing: boolean;
}
