import type { ReactNode } from 'react';

export type StatTrendDirection = 'up' | 'down' | 'neutral';

export interface IStatTileProps {
  /** Faint kanji watermark in the corner (decorative). */
  readonly kanji: string;
  /** The headline value — number, time, or artist name. */
  readonly value: ReactNode;
  /** Lowercase descriptor under the value ("Listened this week"). */
  readonly label: string;
  /** Sub-line: trend delta or context ("+2h 18m vs. last week"). */
  readonly hint?: ReactNode;
  /** Tints the hint: `up` positive (green), others muted. */
  readonly trend?: StatTrendDirection;
}

export interface IStatTileView {
  /** Whether the hint sub-line should render (non-empty hint). */
  readonly showHint: boolean;
  /** Resolved tint class for the hint, derived from the trend direction. */
  readonly hintClass: string;
}
