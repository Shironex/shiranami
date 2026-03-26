import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Square, Copy, X, Plus, FolderOpen, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { useAppStore } from '@/stores/useAppStore';

const VIEW_TITLE_KEYS: Record<string, string> = {
  library: 'library',
  playlists: 'playlists',
  favorites: 'favorites',
  search: 'search',
  'import-playlist': 'importPlaylist',
  radio: 'radio',
  settings: 'settings',
};

interface TopBarProps {
  onAddFile?: () => void;
  onAddFolder?: () => void;
  isScanning?: boolean;
}

export function TopBar({ onAddFile, onAddFolder, isScanning }: TopBarProps) {
  const { t } = useTranslation('topbar');
  const activeView = useAppStore(s => s.activeView);
  const [isMaximized, setIsMaximized] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    window.electronAPI?.window.isMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI?.window.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, []);

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

  const handleMinimize = useCallback(() => window.electronAPI?.window.minimize(), []);
  const handleMaximize = useCallback(() => window.electronAPI?.window.maximize(), []);
  const handleClose = useCallback(() => window.electronAPI?.window.close(), []);

  return (
    <div className="drag h-11 flex items-center shrink-0 border-b border-border/20 relative z-10">
      {/* Page title */}
      <div className="no-drag flex items-center px-5">
        <h1 className="font-display text-sm font-semibold text-foreground">
          {t(VIEW_TITLE_KEYS[activeView] || 'library', { ns: 'sidebar' })}
        </h1>
      </div>

      <div className="flex-1" />

      {/* Add dropdown - only show on library view */}
      {activeView === 'library' && (
        <div ref={dropdownRef} className="no-drag relative mr-2">
          <button
            onClick={() => setDropdownOpen(v => !v)}
            disabled={isScanning}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              dropdownOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isScanning ? t('scanning') : t('add')}</span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50">
              <button
                onClick={() => { onAddFolder?.(); setDropdownOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                {t('addFolder')}
              </button>
              <button
                onClick={() => { onAddFile?.(); setDropdownOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
              >
                <File className="w-4 h-4 text-muted-foreground" />
                {t('addFile')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Window controls (Windows only) */}
      {IS_ELECTRON && !IS_MAC && (
        <div className="no-drag flex h-full items-center gap-1 pr-1.5">
          <button
            type="button"
            onClick={handleMinimize}
            className="flex h-8 w-10 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('minimize')}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="flex h-8 w-10 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
            aria-label={isMaximized ? t('restore') : t('maximize')}
          >
            {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'flex h-8 w-10 items-center justify-center rounded-md',
              'text-muted-foreground/55 transition-colors',
              'hover:bg-red-500/85 hover:text-white'
            )}
            aria-label={t('close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
