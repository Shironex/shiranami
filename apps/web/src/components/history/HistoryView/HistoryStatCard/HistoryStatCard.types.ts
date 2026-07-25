import type { LucideIcon } from 'lucide-react';

export interface IHistoryStatCardProps {
  /** Small uppercase caption above the figure. */
  readonly label: string;
  /** The already-formatted headline figure. */
  readonly value: string;
  /** Supporting line beneath the figure. */
  readonly hint: string;
  /** Contextual icon shown opposite the label. */
  readonly icon: LucideIcon;
}

export interface IHistoryStatCardView {
  /** Small uppercase caption above the figure. */
  readonly label: string;
  /** The already-formatted headline figure. */
  readonly value: string;
  /** Supporting line beneath the figure. */
  readonly hint: string;
  /** Contextual icon component, renamed for direct JSX use. */
  readonly Icon: LucideIcon;
}
