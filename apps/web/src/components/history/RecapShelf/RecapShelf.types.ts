import type { WeeklyRecap } from '@/hooks/queries/useRecap';

/**
 * RecapShelf derives everything from the clock and the history reads, so its
 * props surface is intentionally empty — the shape keeps the per-component
 * contract consistent.
 */
export interface IRecapShelfProps {}

/** One selectable past week in the shelf's row. */
export interface IRecapShelfWeek {
  /** Week identity (`YYYY-MM-DD` of its Monday). */
  readonly key: string;
  /** Localized "27 Jul – 2 Aug" range label. */
  readonly label: string;
  /** Whether this week is the one currently narrated. */
  readonly selected: boolean;
}

export interface IRecapShelfView {
  /** Unique id wiring the shelf section's `aria-labelledby` to its heading. */
  readonly headingId: string;
  /** Shelf heading ("Recaps"). */
  readonly title: string;
  /** Sub-caption under the heading. */
  readonly caption: string;
  /** The selectable past weeks, newest first. */
  readonly weeks: readonly IRecapShelfWeek[];
  /** Select a week by key. */
  readonly onSelectWeek: (key: string) => void;
  /** The selected week's derived recap, once loaded. */
  readonly recap: WeeklyRecap | null;
  /** The selected week's range label (the card's eyebrow). */
  readonly selectedLabel: string;
  /** Whether the selected week's recap is still deriving. */
  readonly isLoading: boolean;
  /** Localized line for a week with no plays at all. */
  readonly quietWeekCopy: string;
}
