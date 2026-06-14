import type { ListeningActivityPoint } from '@/types/electron';
import type { HistoryRange } from '@/components/history/historyUtils';

export interface IHistoryActivityGraphProps {
  readonly points: ListeningActivityPoint[];
  readonly range: HistoryRange;
}

/** A single rendered bar, fully computed by the hook so the shell renders only. */
export interface IHistoryActivityBar {
  readonly date: string;
  readonly height: number;
  readonly label: string;
  readonly isEmpty: boolean;
  readonly title: string;
}

export interface IHistoryActivityGraphView {
  /** No data for the range — render the colocated empty state instead of bars. */
  readonly isEmpty: boolean;
  /** Empty-state title (only meaningful when `isEmpty`). */
  readonly emptyTitle: string;
  /** Empty-state copy (only meaningful when `isEmpty`). */
  readonly emptyCopy: string;
  /** Accessible label for the graph wrapper. */
  readonly graphAriaLabel: string;
  /** Tailwind width class applied to each bar, scaled to the point count. */
  readonly barWidthClass: string;
  /** Fully-computed bars, ready to render in order. */
  readonly bars: readonly IHistoryActivityBar[];
}
