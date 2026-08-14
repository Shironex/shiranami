import { Plus, FolderOpen, File, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WindowControls } from '@/components/shared/WindowControls';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Menu, MenuDivider, MenuItem } from '@/components/ui/menu';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { useTopBar } from './TopBar.hooks';
import type { ITopBarProps } from './TopBar.types';

export default function TopBar(props: ITopBarProps) {
  const {
    t,
    titleKey,
    isNowPlaying,
    isLibraryView,
    dropdownOpen,
    onDropdownOpenChange,
    closeDropdown,
    addMenuRef,
    onDropdownAutoFocus,
    scanBlocked,
    isRescanning,
    rescanDisabled,
    onRescan,
    showLanguageSwitcher,
    currentLanguage,
    onLanguageChange,
    onLanguageKeyDown,
    onAddFolder,
    onAddFile,
  } = useTopBar(props);

  // Guard against an i18n language outside the supported set — the group must
  // always keep exactly one tab stop.
  const checkedLanguage = SUPPORTED_LANGUAGES.some(lang => lang.code === currentLanguage)
    ? currentLanguage
    : SUPPORTED_LANGUAGES[0].code;

  const languageButtons = SUPPORTED_LANGUAGES.map(lang => (
    <button
      key={lang.code}
      type="button"
      role="radio"
      aria-checked={checkedLanguage === lang.code}
      tabIndex={checkedLanguage === lang.code ? 0 : -1}
      aria-label={lang.label}
      onClick={() => onLanguageChange(lang.code)}
      onKeyDown={onLanguageKeyDown}
      className={cn(
        'focus-ring px-2 py-1 rounded-md text-xs font-medium transition-colors',
        checkedLanguage === lang.code
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground/60 hover:text-foreground hover:bg-accent'
      )}
    >
      {t(`language.${lang.code}`)}
    </button>
  ));

  return (
    <div className="app-topbar drag h-11 flex items-center shrink-0 border-b border-border/20 relative z-10">
      {/* Page title — skipped on the now-playing view, which carries its own
          header chrome (back button + panel toggles), so a duplicate page
          title would just be redundant noise. */}
      {!isNowPlaying && (
        <div className="no-drag flex items-center px-5">
          <h1 className="font-display text-sm font-semibold text-foreground">
            {t(titleKey, { ns: 'sidebar' })}
          </h1>
        </div>
      )}

      <div className="flex-1" />

      {/* Add dropdown - only show on library view */}
      {isLibraryView && (
        <div className="no-drag mr-2">
          <Popover open={dropdownOpen} onOpenChange={onDropdownOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={scanBlocked}
                aria-haspopup="menu"
                className={cn(
                  'focus-ring flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  dropdownOpen
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{scanBlocked ? t('scanning') : t('add')}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={4}
              onOpenAutoFocus={onDropdownAutoFocus}
              className="w-44 p-0 bg-card border-border/50 duration-[120ms]"
            >
              <Menu ref={addMenuRef} aria-label={t('add')} onRequestClose={closeDropdown}>
                <MenuItem icon={<FolderOpen className="w-4 h-4" />} onClick={onAddFolder}>
                  {t('addFolder')}
                </MenuItem>
                <MenuItem icon={<File className="w-4 h-4" />} onClick={onAddFile}>
                  {t('addFile')}
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  icon={
                    isRescanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )
                  }
                  disabled={rescanDisabled}
                  onClick={onRescan}
                >
                  {isRescanning ? t('rescanning') : t('rescan')}
                </MenuItem>
              </Menu>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Language segmented control — hideable via Settings · Interface
          (the picker also lives in Settings · Appearance, so nothing is lost) */}
      {showLanguageSwitcher && (
        <div
          role="radiogroup"
          aria-label={t('language.label')}
          className="no-drag flex items-center gap-0.5 mr-2"
        >
          {languageButtons}
        </div>
      )}

      {/* Window controls (Windows only) */}
      <WindowControls className="pr-1.5" />
    </div>
  );
}
