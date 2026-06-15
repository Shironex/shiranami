import type { VolumeUsage } from '@shiranami/contracts';

export interface IDiskUsageBarProps {
  /** Per-volume usage figures (music/total/free bytes) for one physical volume. */
  readonly volume: VolumeUsage;
}

/** One legend entry beneath the segmented bar (swatch + label + formatted value). */
export interface IDiskUsageLegendItem {
  /** Tailwind classes for the color swatch. */
  readonly swatchClassName: string;
  /** Localized segment label. */
  readonly label: string;
  /** Formatted byte value for the segment. */
  readonly value: string;
}

export interface IDiskUsageBarView {
  /** Accessible label describing the full breakdown for the bar's `role="img"`. */
  readonly ariaLabel: string;
  /** Localized "X used of Y" caption above the bar. */
  readonly usedOfTotalLabel: string;
  /** Width of the music segment as a CSS percentage string (e.g. "42%"). */
  readonly musicWidth: string;
  /** Width of the other-used segment as a CSS percentage string. */
  readonly otherWidth: string;
  /** Legend entries (music / other / free), pre-formatted. */
  readonly legendItems: readonly IDiskUsageLegendItem[];
}
