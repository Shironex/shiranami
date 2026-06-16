import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '@/stores/useViewStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { isScanLocked } from '@/lib/scanLock';
import { persistLanguage, type SupportedLanguage } from '@/lib/i18n';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isScanning: isRescanning, rescan } = useLibraryRescan();
  const showLanguageSwitcher = useInterfaceStore(s => s.topBarLanguageSwitcher);

  const scanBlocked = Boolean(isScanning) || isRescanning || isScanLocked();

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  return {
    t,
    titleKey: VIEW_TITLE_KEYS[activeView] || 'library',
    isNowPlaying: activeView === 'now-playing',
    isLibraryView: activeView === 'library',
    dropdownOpen,
    toggleDropdown: () => setDropdownOpen(v => !v),
    closeDropdown: () => setDropdownOpen(false),
    dropdownRef,
    scanBlocked,
    isRescanning,
    rescanDisabled: isRescanning || isScanLocked(),
    onRescan: () => {
      rescan();
      setDropdownOpen(false);
    },
    showLanguageSwitcher,
    currentLanguage: i18n.language,
    onLanguageChange: (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
      persistLanguage(lang);
    },
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
