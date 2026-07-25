export interface ICrossfadePreviewProps {
  /** Whether tracks crossfade into each other instead of cutting. */
  readonly enabled: boolean;
  /** Current crossfade duration in seconds. */
  readonly duration: number;
}

export interface ICrossfadePreviewView {
  /** Localized preview panel title. */
  readonly title: string;
  /** Localized label for the track that is fading out. */
  readonly outgoingLabel: string;
  /** Localized label for the track that is coming in. */
  readonly incomingLabel: string;
  /** Left offset of the incoming-track bar as a CSS length. */
  readonly incomingLeft: string;
  /** Width of the incoming-track bar as a CSS length. */
  readonly incomingWidth: string;
  /** Whether the soft overlap glow is drawn between the two bars. */
  readonly showBlendGlow: boolean;
  /** Localized caption describing the transition (blend vs. clean cut). */
  readonly statusLabel: string;
  /** Localized overlap duration, or `0s` when crossfade is off. */
  readonly durationLabel: string;
}
