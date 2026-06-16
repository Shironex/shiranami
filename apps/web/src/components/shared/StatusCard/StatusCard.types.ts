import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface IStatusCardProps {
  /** Card title shown beneath the mascot. */
  readonly title: string;
  /** Optional supporting description. */
  readonly description?: string;
  /** Badge icon shown over the mascot. Ignored while `loading` (spinner wins). */
  readonly badgeIcon?: LucideIcon;
  /** `'destructive'` tints the mascot frame + badge red for error states. */
  readonly variant?: 'default' | 'destructive';
  /** Shows a spinner badge instead of `badgeIcon`. */
  readonly loading?: boolean;
  /** Optional content rendered beneath the description (e.g. actions). */
  readonly children?: ReactNode;
}

export interface IStatusCardView {
  /** Card title shown beneath the mascot. */
  readonly title: string;
  /** Optional supporting description. */
  readonly description?: string;
  /** Badge icon shown over the mascot. Ignored while `loading` (spinner wins). */
  readonly badgeIcon?: LucideIcon;
  /** Resolved loading flag (defaults to `false`). */
  readonly loading: boolean;
  /** Optional content rendered beneath the description (e.g. actions). */
  readonly children?: ReactNode;
  /** Derived: whether the destructive tint applies. */
  readonly isError: boolean;
  /** Derived: whether a badge (spinner or icon) should render. */
  readonly showBadge: boolean;
}
