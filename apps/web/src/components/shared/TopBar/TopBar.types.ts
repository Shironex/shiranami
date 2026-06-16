import type { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@/lib/i18n';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ITopBarProps {
  readonly onAddFile?: () => void;
  readonly onAddFolder?: () => void;
  readonly isScanning?: boolean;
}

export interface ITopBarView {
  /** Bound `topbar` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** The active sidebar-namespace title key for the current view. */
  readonly titleKey: string;
  /** True on the now-playing view, which carries its own header — page title hidden. */
  readonly isNowPlaying: boolean;
  /** True on the library view, where the Add/Rescan dropdown is offered. */
  readonly isLibraryView: boolean;
  /** Whether the Add/Rescan dropdown is open. */
  readonly dropdownOpen: boolean;
  /** Toggle the Add/Rescan dropdown. */
  readonly toggleDropdown: () => void;
  /** Close the Add/Rescan dropdown. */
  readonly closeDropdown: () => void;
  /** Ref for the dropdown wrapper — drives click-outside dismissal. */
  readonly dropdownRef: React.RefObject<HTMLDivElement | null>;
  /** Add/Rescan actions are blocked while any scan is in progress. */
  readonly scanBlocked: boolean;
  /** A library rescan is currently running. */
  readonly isRescanning: boolean;
  /** The rescan menu item is disabled (rescan running or a scan lock is held). */
  readonly rescanDisabled: boolean;
  /** Start a library rescan, then close the dropdown. */
  readonly onRescan: () => void;
  /** Whether the inline language segmented control shows (Settings · Interface toggle). */
  readonly showLanguageSwitcher: boolean;
  /** The active i18n language code. */
  readonly currentLanguage: string;
  /** Switch language and persist the choice. */
  readonly onLanguageChange: (lang: SupportedLanguage) => void;
  /** Add a folder (gated by the host), then close the dropdown. */
  readonly onAddFolder: () => void;
  /** Add a single file (gated by the host), then close the dropdown. */
  readonly onAddFile: () => void;
}
