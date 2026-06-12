import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FolderOpen, File, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewStore } from '@/stores/useViewStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { WindowControls } from '@/components/shared/WindowControls';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { isScanLocked } from '@/lib/scanLock';
import { SUPPORTED_LANGUAGES, persistLanguage, type SupportedLanguage } from '@/lib/i18n';

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

interface TopBarProps {
  onAddFile?: () => void;
  onAddFolder?: () => void;
  isScanning?: boolean;
}

export function TopBar({ onAddFile, onAddFolder, isScanning }: TopBarProps) {
  const { t, i18n } = useTranslation('topbar');
  const activeView = useViewStore(s => s.activeView);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isScanning: isRescanning, rescan } = useLibraryRescan();
  const showLanguageSwitcher = useInterfaceStore(s => s.topBarLanguageSwitcher);

  const scanBlocked = isScanning || isRescanning || isScanLocked();

  function handleLanguageChange(lang: SupportedLanguage) {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  }

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

  return (
    <div className="app-topbar drag h-11 flex items-center shrink-0 border-b border-border/20 relative z-10">
      {/* Page title — skipped on the now-playing view, which carries its own
          header chrome (back button + panel toggles), so a duplicate page
          title would just be redundant noise. */}
      {activeView !== 'now-playing' && (
        <div className="no-drag flex items-center px-5">
          <h1 className="font-display text-sm font-semibold text-foreground">
            {t(VIEW_TITLE_KEYS[activeView] || 'library', { ns: 'sidebar' })}
          </h1>
        </div>
      )}

      <div className="flex-1" />

      {/* Add dropdown - only show on library view */}
      {activeView === 'library' && (
        <div ref={dropdownRef} className="no-drag relative mr-2">
          <button
            onClick={() => setDropdownOpen(v => !v)}
            disabled={scanBlocked}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              dropdownOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{scanBlocked ? t('scanning') : t('add')}</span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50">
              <button
                onClick={() => {
                  onAddFolder?.();
                  setDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                {t('addFolder')}
              </button>
              <button
                onClick={() => {
                  onAddFile?.();
                  setDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
              >
                <File className="w-4 h-4 text-muted-foreground" />
                {t('addFile')}
              </button>
              <div className="my-1 mx-2 h-px bg-border/40" />
              <button
                onClick={() => {
                  rescan();
                  setDropdownOpen(false);
                }}
                disabled={isRescanning || isScanLocked()}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {isRescanning ? (
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                )}
                {isRescanning ? t('rescanning') : t('rescan')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Language segmented control — hideable via Settings · Interface
          (the picker also lives in Settings · Appearance, so nothing is lost) */}
      {showLanguageSwitcher && (
        <div className="no-drag flex items-center gap-0.5 mr-2">
          {SUPPORTED_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleLanguageChange(lang.code)}
              aria-label={t(`language.${lang.code}`)}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                i18n.language === lang.code
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-accent'
              )}
            >
              {t(`language.${lang.code}`)}
            </button>
          ))}
        </div>
      )}

      {/* Window controls (Windows only) */}
      <WindowControls className="pr-1.5" />
    </div>
  );
}
