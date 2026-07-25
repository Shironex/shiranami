import type { ReactNode } from 'react';

export interface ISearchStateCardProps {
  /** Card title shown beneath the mascot. */
  readonly title: string;
  /** Supporting copy shown beneath the title. */
  readonly description: string;
  /** Swaps the badge for a spinner while the state is resolving. */
  readonly loading?: boolean;
  /** Optional content rendered beneath the description (e.g. actions). */
  readonly children?: ReactNode;
}

export interface ISearchStateCardView {
  /** Card title shown beneath the mascot. */
  readonly title: string;
  /** Supporting copy shown beneath the title. */
  readonly description: string;
  /** Forwarded loading flag — `StatusCard` owns the default. */
  readonly loading?: boolean;
  /** Optional content rendered beneath the description (e.g. actions). */
  readonly children?: ReactNode;
}
