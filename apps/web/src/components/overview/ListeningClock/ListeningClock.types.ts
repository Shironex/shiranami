import type { HeatLevel, HeatmapModel } from '../overviewUtils';

export interface IListeningClockProps {
  readonly heatmap: HeatmapModel;
}

/** One render-ready heatmap cell with its precomputed tooltip + intensity class. */
export interface IHeatmapCellView {
  readonly hour: number;
  readonly level: HeatLevel;
  /** Tailwind background class for the cell's intensity. */
  readonly levelClass: string;
  /** Whether to draw the non-color ring cue (busiest cells). */
  readonly emphasized: boolean;
  /** Localized tooltip text. */
  readonly title: string;
}

/** One weekday row of the heatmap. */
export interface IHeatmapRowView {
  readonly key: number;
  /** Short weekday label (Mon-first). */
  readonly dayLabel: string;
  readonly cells: readonly IHeatmapCellView[];
}

/** A legend swatch (level + its background class). */
export interface IHeatmapLegendSwatch {
  readonly level: HeatLevel;
  readonly levelClass: string;
}

export interface IListeningClockView {
  /** Card heading ("Listening clock"). */
  readonly title: string;
  /** "Last 7 days" eyebrow. */
  readonly rangeLabel: string;
  /** Whether the grid has any plays — otherwise the empty copy shows. */
  readonly hasData: boolean;
  /** Empty-state copy (only meaningful when `!hasData`). */
  readonly emptyCopy: string;
  /** Accessible label for the grid. */
  readonly gridAriaLabel: string;
  /** Hour ticks shown above the grid. */
  readonly hourTicks: readonly string[];
  /** Fully computed weekday rows. */
  readonly rows: readonly IHeatmapRowView[];
  /** Legend swatches, quiet → loud. */
  readonly legendSwatches: readonly IHeatmapLegendSwatch[];
  /** "Quiet" legend label. */
  readonly legendQuiet: string;
  /** "Loud" legend label. */
  readonly legendLoud: string;
  /** Peak-window label, or the "no peak" fallback. */
  readonly peakLabel: string;
}
