import type { CSSProperties, ReactNode, RefObject } from 'react';

export interface IOverflowAction {
  /** Stable key for the row. */
  readonly key: string;
  /** Leading glyph rendered in the row's icon slot. */
  readonly icon: ReactNode;
  /** Row label. */
  readonly label: string;
  /** Runs when the row is chosen. */
  readonly onClick: () => void;
  /** `'destructive'` tints the row red and opens the destructive group. */
  readonly variant?: 'default' | 'destructive';
}

export interface IMoreMenuProps {
  /** The collapsed actions, in render order. */
  readonly actions: IOverflowAction[];
}

/** One resolved popover row: an action plus its separator flag and bound handler. */
export interface IMoreMenuRow {
  /** Stable key for the row. */
  readonly key: string;
  /** Leading glyph rendered in the row's icon slot. */
  readonly icon: ReactNode;
  /** Row label. */
  readonly label: string;
  /** Row tint (defaults to `'default'` in the row component). */
  readonly variant?: 'default' | 'destructive';
  /** Whether a separator precedes this row — set on the first destructive row of the group. */
  readonly showDivider: boolean;
  /** Closes the popover, then runs the action's own handler. */
  readonly onSelect: () => void;
}

export interface IMoreMenuView {
  /** Localized "More" label — the trigger's title/accessible name and the menu's name. */
  readonly moreLabel: string;
  /** Whether the overflow popover is open. */
  readonly isOpen: boolean;
  /** Ref for the trigger button — the popover's fixed position is derived from its rect. */
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  /** Ref for the portalled popover — used for outside-click detection. */
  readonly popoverRef: RefObject<HTMLDivElement | null>;
  /** Fixed-position style for the portalled popover, derived from the trigger. */
  readonly popoverStyle: CSSProperties;
  /** Toggles the popover open/closed. */
  readonly onToggle: () => void;
  /** The rows to render, each carrying its divider flag and bound handler. */
  readonly rows: readonly IMoreMenuRow[];
}
