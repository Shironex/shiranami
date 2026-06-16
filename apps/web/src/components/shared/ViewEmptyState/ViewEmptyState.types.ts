import type { LucideIcon } from 'lucide-react';

export interface IViewEmptyStateAction {
  /** Button label. */
  readonly label: string;
  /** Click handler invoked when the action button is pressed. */
  readonly onClick: () => void;
}

export interface IViewEmptyStateHint {
  /** Leading icon for the hint chip. */
  readonly icon: LucideIcon;
  /** Hint chip label. */
  readonly label: string;
}

export interface IViewEmptyStateProps {
  /** Primary heading shown beneath the mascot. */
  readonly title: string;
  /** Supporting copy shown beneath the title. */
  readonly subtitle: string;
  /** Contextual icon shown in the badge / compact frame. */
  readonly icon: LucideIcon;
  /** Optional row of contextual hint chips. */
  readonly hints?: readonly IViewEmptyStateHint[];
  /** `'error'` tints the mascot frame + badge red for error states. */
  readonly variant?: 'empty' | 'error';
  /** Optional call-to-action button. */
  readonly action?: IViewEmptyStateAction;
  /**
   * Lighter inline layout (single muted icon + title + subtitle, no mascot
   * frame or glass panel) for in-view "no matches" / "empty mix" states.
   */
  readonly compact?: boolean;
}

export interface IViewEmptyStateView {
  /** Primary heading shown beneath the mascot. */
  readonly title: string;
  /** Supporting copy shown beneath the title. */
  readonly subtitle: string;
  /** Contextual icon shown in the badge / compact frame. */
  readonly icon: LucideIcon;
  /** Optional row of contextual hint chips. */
  readonly hints?: readonly IViewEmptyStateHint[];
  /** Resolved visual variant (defaults to `'empty'`). */
  readonly variant: 'empty' | 'error';
  /** Optional call-to-action button. */
  readonly action?: IViewEmptyStateAction;
  /** Resolved compact flag (defaults to `false`). */
  readonly compact: boolean;
  /** Derived: whether the error tint applies. */
  readonly isError: boolean;
}
