import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IShortcut {
  readonly keys: readonly string[];
  readonly actionKey: string;
}

export interface IShortcutCategory {
  readonly titleKey: string;
  readonly glyph: string;
  readonly shortcuts: readonly IShortcut[];
}

/**
 * Categories are returned as a keyed record (not an array) so consumers can
 * destructure by name without depending on positional order. Adding or
 * reordering categories is then a compile-error if any consumer is missed.
 */
export interface IShortcutCategories {
  readonly playback: IShortcutCategory;
  readonly navigation: IShortcutCategory;
  readonly panelsUi: IShortcutCategory;
}

export interface IKeyboardShortcutsHelpView {
  /** Bound `shortcuts` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the help dialog is open. */
  readonly open: boolean;
  /** Controls the help dialog open state. */
  readonly setOpen: (open: boolean) => void;
  /** Memoized, platform-resolved shortcut categories for the reference grid. */
  readonly categories: IShortcutCategories;
}
