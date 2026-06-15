import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One system-behavior toggle row, pre-resolved with its localized copy and state. */
export interface ISystemToggle {
  /** The underlying system-pref key (stable React key). */
  readonly key: string;
  /** Localized row label. */
  readonly label: string;
  /** Localized row description. */
  readonly description: string;
  /** Current checked state. */
  readonly checked: boolean;
  /** Whether the toggle is disabled (non-Electron or prefs not yet loaded). */
  readonly disabled: boolean;
  /** Whether to show a divider above this row (every row except the first). */
  readonly divider: boolean;
  /** Persist a new value for this toggle. */
  readonly onCheckedChange: (value: boolean) => void;
}

export interface ISystemSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** The behavior toggle rows, pre-resolved with copy + state + handlers. */
  readonly toggles: readonly ISystemToggle[];
  /** Whether the macOS tray note callout is shown. */
  readonly showMacTrayNote: boolean;
}
