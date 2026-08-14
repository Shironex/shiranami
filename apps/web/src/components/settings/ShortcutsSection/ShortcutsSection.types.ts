import type { useTranslation } from 'react-i18next';
import type { ShortcutActionId } from '@/lib/keymap';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One rebindable shortcut row, pre-resolved with its localized strings. */
export interface IShortcutRow {
  /** Keymap action id (also the `shortcuts`-namespace label key). */
  readonly id: ShortcutActionId;
  /** Localized action label. */
  readonly label: string;
  /** Formatted chord labels for the kbd chips (`['⌘', 'Shift', 'M']`). */
  readonly keys: readonly string[];
  /** Whether the binding differs from its default (shows the reset button). */
  readonly modified: boolean;
  /** Whether this row is currently capturing a new chord. */
  readonly capturing: boolean;
  /** Localized aria-label for the binding button in its current state. */
  readonly bindingAria: string;
  /** Localized aria-label for the per-row reset button. */
  readonly resetAria: string;
}

/** A titled group of shortcut rows (mirrors the help dialog's categories). */
export interface IShortcutGroup {
  /** Localized group title. */
  readonly title: string;
  /** Rows in display order. */
  readonly rows: readonly IShortcutRow[];
}

/**
 * Groups as a keyed record (not an array) so the shell destructures by name —
 * same convention as the help dialog's `IShortcutCategories`.
 */
export interface IShortcutGroups {
  readonly playback: IShortcutGroup;
  readonly panelsUi: IShortcutGroup;
}

/** The rejected-capture notice rendered under the capturing row. */
export interface IConflictNotice {
  /** The row the notice belongs under. */
  readonly actionId: ShortcutActionId;
  /** Localized warning message. */
  readonly message: string;
}

export interface IShortcutsSectionView {
  /** Bound `shortcuts`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shortcut groups, pre-resolved with labels + chord chips. */
  readonly groups: IShortcutGroups;
  /** Warning for the last rejected capture, if any. */
  readonly conflict: IConflictNotice | null;
  /** Whether any binding differs from its default. */
  readonly anyModified: boolean;
  /** Begin (or cancel, when already capturing) chord capture for a row. */
  readonly onToggleCapture: (id: ShortcutActionId) => void;
  /** Restore one binding to its default. */
  readonly onResetBinding: (id: ShortcutActionId) => void;
  /** Restore every binding to its default. */
  readonly onResetAll: () => void;
}
