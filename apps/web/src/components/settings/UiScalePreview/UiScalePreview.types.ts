export interface IUiScalePreviewProps {
  /** Current interface scale percentage from the slider. */
  readonly scale: number;
}

/** One sample card rendered at a fixed pixel base × `factor`. */
export interface IUiScaleSampleTileProps {
  /** Caption shown under the tile (e.g. "Default 100%"). */
  readonly label: string;
  /** Scale multiplier applied to the tile's pixel sizing. */
  readonly factor: number;
  /** Sample title text. */
  readonly title: string;
  /** Sample subtitle text. */
  readonly subtitle: string;
  /** Whether this tile represents the active (chosen) scale. */
  readonly active?: boolean;
}

export interface IUiScalePreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Localized sample card title text. */
  readonly sampleTitle: string;
  /** Localized sample card subtitle text. */
  readonly sampleSubtitle: string;
  /** Caption for the base (default-scale) tile. */
  readonly baseLabel: string;
  /** Caption for the current (chosen-scale) tile. */
  readonly currentLabel: string;
  /** Multiplier for the current tile (chosen scale ÷ 100). */
  readonly currentFactor: number;
}
