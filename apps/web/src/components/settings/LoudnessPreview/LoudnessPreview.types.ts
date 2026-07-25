export interface ILoudnessPreviewProps {
  /** Whether volume leveling is applied on playback. */
  readonly enabled: boolean;
  /** Current target LUFS from the slider; drives the target line position. */
  readonly target: number;
}

export interface ILoudnessPreviewView {
  /** Localized preview panel title. */
  readonly title: string;
  /** Target loudness label drawn against the dashed line. */
  readonly targetLabel: string;
  /** CSS `bottom` for the dashed target line. */
  readonly targetLineBottom: string;
  /** Per-track bar heights as CSS lengths, in bar order. */
  readonly barHeights: readonly string[];
  /** Localized caption explaining what the current setting does. */
  readonly caption: string;
}
