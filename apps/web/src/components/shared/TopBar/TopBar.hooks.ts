import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '@/stores/useViewStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { isScanLocked } from '@/lib/scanLock';
import { persistLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import type { ITopBarProps, ITopBarView } from './TopBar.types';

const VIEW_TITLE_KEYS: Record<string, string> = {
  overview: 'overview',
  library: 'library',
  playlists: 'playlists',
  favorites: 'favorites',
  search: 'search',
  'import-playlist': 'importPlaylist',
  radio: 'radio',
  settings: 'settings',
  history: 'history',
  mixes: 'mixes',
};

export function useTopBar({ onAddFile, onAddFolder, isScanning }: ITopBarProps): ITopBarView {
  const { t, i18n } = useTranslation('topbar');
  const activeView = useViewStore(s => s.activeView);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const { isScanning: isRescanning, rescan } = useLibraryRescan();
  const showLanguageSwitcher = useInterfaceStore(s => s.topBarLanguageSwitcher);

  const scanBlocked = Boolean(isScanning) || isRescanning || isScanLocked();

  const handleLanguageChange = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  };

  const handleLanguageKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const codes = SUPPORTED_LANGUAGES.map(lang => lang.code);
    const current = codes.indexOf(i18n.language as SupportedLanguage);
    const nextIndex = (Math.max(current, 0) + delta + codes.length) % codes.length;
    handleLanguageChange(codes[nextIndex]);
    // Radiogroup convention: selection follows focus, so move focus onto the
    // radio that just became checked.
    const radios = event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  };

  return {
    t,
    titleKey: VIEW_TITLE_KEYS[activeView] || 'library',
    isNowPlaying: activeView === 'now-playing',
    isLibraryView: activeView === 'library',
    dropdownOpen,
    onDropdownOpenChange: setDropdownOpen,
    closeDropdown: () => setDropdownOpen(false),
    addMenuRef,
    onDropdownAutoFocus: event => {
      // The popover would focus its content wrapper; hand focus to the menu
      // itself so arrow keys and typeahead work immediately.
      event.preventDefault();
      addMenuRef.current?.focus({ preventScroll: true });
    },
    scanBlocked,
    isRescanning,
    rescanDisabled: isRescanning || isScanLocked(),
    onRescan: () => {
      rescan();
      setDropdownOpen(false);
    },
    showLanguageSwitcher,
    currentLanguage: i18n.language,
    onLanguageChange: handleLanguageChange,
    onLanguageKeyDown: handleLanguageKeyDown,
    onAddFolder: () => {
      onAddFolder?.();
      setDropdownOpen(false);
    },
    onAddFile: () => {
      onAddFile?.();
      setDropdownOpen(false);
    },
  };
}
