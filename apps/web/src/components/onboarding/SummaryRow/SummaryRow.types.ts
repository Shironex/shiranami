import type { ReactNode } from 'react';

export interface ISummaryRowProps {
  /** Leading glyph for the row — rendered decoratively beside the label. */
  readonly icon: ReactNode;
  /** What was configured, e.g. "Theme". */
  readonly label: string;
  /** The choice the user made, shown right-aligned in mono. */
  readonly value: string;
  /** Tints the value with the accent color (e.g. an enabled integration). */
  readonly highlight?: boolean;
}

export interface ISummaryRowView {
  /** Leading glyph for the row. */
  readonly icon: ReactNode;
  /** What was configured. */
  readonly label: string;
  /** The choice the user made. */
  readonly value: string;
  /** Resolved highlight flag (defaults to `false`) — accents the value. */
  readonly isHighlighted: boolean;
}
