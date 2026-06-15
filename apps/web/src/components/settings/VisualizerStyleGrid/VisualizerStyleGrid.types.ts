import type { VisualizerStyle } from '@/stores/useUIStore';

export interface IVisualizerStyleGridProps {
  /** Currently-selected visualizer style. */
  readonly value: VisualizerStyle;
  /** Called with the chosen style when a tile is pressed. */
  readonly onSelect: (style: VisualizerStyle) => void;
  /** Tailwind grid-column count (default 2, matching Settings · Visualizer). */
  readonly columns?: 2 | 3;
  /** Condensed variant — drops the per-style description line. */
  readonly compact?: boolean;
}

export interface IVisualizerStyleTile {
  /** The style this tile selects. */
  readonly value: VisualizerStyle;
  /** Localized style name. */
  readonly label: string;
  /** Localized one-line description (hidden in compact mode). */
  readonly description: string;
  /** Whether this tile is the active selection. */
  readonly selected: boolean;
}

export interface IVisualizerStyleGridView {
  /** Tiles to render, one per registered visualizer style. */
  readonly tiles: readonly IVisualizerStyleTile[];
  /** Tailwind class for the grid container (column count). */
  readonly gridClassName: string;
  /** Whether descriptions are hidden (compact variant). */
  readonly compact: boolean;
  /** Select handler forwarded from props. */
  readonly onSelect: (style: VisualizerStyle) => void;
}
