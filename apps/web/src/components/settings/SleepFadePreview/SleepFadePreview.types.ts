export interface ISleepFadePreviewProps {
  /** Current fade-out duration in seconds; drives the ramp slope. */
  readonly duration: number;
}

export interface ISleepFadePreviewView {
  /** Localized preview panel title. */
  readonly title: string;
  /** Per-bar heights as CSS percentages, left (full volume) to right (silence). */
  readonly barHeights: readonly string[];
  /** Localized caption naming the fade length. */
  readonly caption: string;
}
