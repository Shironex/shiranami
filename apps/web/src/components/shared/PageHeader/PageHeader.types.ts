import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IPageHeaderProps {
  /** Header title text. */
  readonly title: string;
  /** Optional leading icon (rendered only in the `section` variant). */
  readonly icon?: LucideIcon;
  /** Optional subtitle (rendered only in the `section` variant). */
  readonly subtitle?: string;
  /** `'page'` renders a top-level `<h1>`; `'section'` an icon + `<h2>` row. */
  readonly variant?: 'page' | 'section';
  /** Optional action controls rendered on the trailing edge of the header. */
  readonly actions?: ReactNode;
}

export interface IPageHeaderView {
  /** Header title text. */
  readonly title: string;
  /** Optional leading icon (rendered only in the `section` variant). */
  readonly icon?: LucideIcon;
  /** Optional subtitle (rendered only in the `section` variant). */
  readonly subtitle?: string;
  /** Resolved variant (defaults to `'page'`). */
  readonly variant: 'page' | 'section';
  /** Optional action controls rendered on the trailing edge of the header. */
  readonly actions?: ReactNode;
}
