import type { ReactNode } from 'react';
import type { InterfaceElementKey } from '@/stores/useInterfaceStore';

export type OverviewWidgetKey = Extract<InterfaceElementKey, `overview${string}`>;

export interface IOverviewLayoutPreviewProps {
  /** Widget to spotlight in the mock (mirrors the row hovered in settings). */
  readonly highlightedKey?: OverviewWidgetKey | null;
}

/** Resolved visibility + spotlight state for one collapsible mock block. */
export interface IOverviewBlockState {
  /** Whether the widget's toggle is on (an off block folds to zero height). */
  readonly visible: boolean;
  /** Whether the hovered settings row spotlights this block. */
  readonly highlighted: boolean;
}

/** One skeleton bar row, with the pixel width its design unit resolves to. */
export interface IOverviewBarRow {
  /** Stable render key (the row's design width unit). */
  readonly key: number;
  /** Bar width in pixels. */
  readonly widthPx: number;
}

export interface IOverviewBlockProps {
  /** Whether the block is expanded (off folds it to zero height). */
  readonly visible: boolean;
  /** Whether the block carries the hover spotlight ring. */
  readonly highlighted: boolean;
  /** max-h-* class for the expanded state (collapse animates via max-height). */
  readonly expandedClass: string;
  /** Mock content rendered inside the block. */
  readonly children: ReactNode;
  /** Extra classes for the block frame. */
  readonly className?: string;
}

export interface IOverviewLayoutPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Stats strip block state. */
  readonly stats: IOverviewBlockState;
  /** Top-tracks-this-week block state. */
  readonly topWeek: IOverviewBlockState;
  /** Listening-clock block state. */
  readonly clock: IOverviewBlockState;
  /** Top-albums block state. */
  readonly topAlbums: IOverviewBlockState;
  /** Smart-mixes shelf block state. */
  readonly mixes: IOverviewBlockState;
  /** Recommendations shelf block state. */
  readonly recommendations: IOverviewBlockState;
  /** Recently-added rows block state. */
  readonly recentlyAdded: IOverviewBlockState;
  /** Whether the clock/albums column renders at all. */
  readonly showRightColumn: boolean;
  /** Whether the week-grid row renders at all. */
  readonly showWeekGrid: boolean;
  /** Render keys for the stats strip tiles. */
  readonly statsTiles: readonly number[];
  /** Top-tracks skeleton rows. */
  readonly topWeekRows: readonly IOverviewBarRow[];
  /** Listening-clock bar heights (%). */
  readonly clockBars: readonly number[];
  /** Render keys for the top-album tiles. */
  readonly albumTiles: readonly number[];
  /** Render keys for the smart-mix tiles. */
  readonly mixTiles: readonly number[];
  /** Render keys for the recommendation tiles. */
  readonly recTiles: readonly number[];
  /** Recently-added skeleton rows. */
  readonly recentRows: readonly IOverviewBarRow[];
}
