import { useTranslation } from 'react-i18next';
import { Languages, Sparkles, LayoutGrid, Palette, Check } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import {
  useUIStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useUIStore';
import { useThemeStore, type ThemeId } from '@/stores/useThemeStore';
import type { AppView } from '@/stores/useViewStore';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES, persistLanguage, type SupportedLanguage } from '@/lib/i18n';

// Drives the theme picker grid. `thumb` reuses the same committed WebP the
// background uses, downscaled by CSS object-fit. The "none" tile has no thumb
// and renders a solid swatch so the default reads as "no photo".
const THEME_TILES: Array<{ id: ThemeId; nameKey: string; thumb?: string }> = [
  { id: 'none', nameKey: 'none' },
  { id: 'lofi-night', nameKey: 'lofiNight', thumb: './themes/lofi-night.webp' },
  { id: 'snow', nameKey: 'snow', thumb: './themes/snow.webp' },
  { id: 'summer', nameKey: 'summer', thumb: './themes/summer.webp' },
  { id: 'sunset', nameKey: 'sunset', thumb: './themes/sunset.webp' },
  { id: 'wisteria', nameKey: 'wisteria', thumb: './themes/wisteria.webp' },
];

const TOGGLEABLE_SIDEBAR_ITEMS: Array<{ id: AppView; key: string }> = [
  { id: 'library', key: 'library' },
  { id: 'playlists', key: 'playlists' },
  { id: 'favorites', key: 'favorites' },
  { id: 'history', key: 'history' },
  { id: 'mixes', key: 'mixes' },
  { id: 'search', key: 'search' },
  { id: 'import-playlist', key: 'importPlaylist' },
  { id: 'radio', key: 'radio' },
];

export function AppearanceSection() {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { t: ts } = useTranslation('sidebar');
  const uiScale = useUIStore(s => s.uiScale);
  const setUiScale = useUIStore(s => s.setUiScale);
  const resetUiScale = useUIStore(s => s.resetUiScale);
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const setNowPlayingViewEnabled = useUIStore(s => s.setNowPlayingViewEnabled);
  const libraryHeroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);
  const setLibraryHeroCardEnabled = useUIStore(s => s.setLibraryHeroCardEnabled);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setLowPerformanceMode = useUIStore(s => s.setLowPerformanceMode);
  const noiseOverlayEnabled = useUIStore(s => s.noiseOverlayEnabled);
  const setNoiseOverlayEnabled = useUIStore(s => s.setNoiseOverlayEnabled);
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const toggleSidebarItem = useUIStore(s => s.toggleSidebarItem);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const setSidebarPlaylistsVisible = useUIStore(s => s.setSidebarPlaylistsVisible);
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  function handleLanguageChange(lang: SupportedLanguage) {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  }

  return (
    <div className="space-y-4">
      {/* Card 1 — Language & scale */}
      <SettingsCard icon={Languages} title={t('app.languageScaleTitle')}>
        <div className="space-y-6">
          {/* Language picker */}
          <div className="px-3">
            <p className="text-sm font-medium text-foreground mb-1">{t('app.languageTitle')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('app.languageDesc')}</p>
            <div className="flex items-center gap-1.5">
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    i18n.language === lang.code
                      ? 'bg-primary/15 text-primary border border-primary/40'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interface scale */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-foreground">{t('app.interfaceScale')}</p>
              <span className="text-xs tabular-nums text-muted-foreground">{uiScale}%</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('app.scaleDesc')}</p>

            <Slider
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={[uiScale]}
              onValueChange={([v]) => setUiScale(v)}
            />

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-1.5">
                {UI_SCALE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => setUiScale(preset)}
                    className={cn(
                      'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                      uiScale === preset
                        ? 'bg-primary/15 text-primary border border-primary/40'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                    )}
                  >
                    {preset}%
                  </button>
                ))}
              </div>

              {uiScale !== UI_SCALE_DEFAULT && (
                <button
                  onClick={resetUiScale}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tc('reset')}
                </button>
              )}
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Card 2 — Visual effects */}
      <SettingsCard icon={Sparkles} title={t('app.effects')}>
        <SettingsToggleRow
          label={t('app.nowPlayingView')}
          description={t('app.nowPlayingViewDesc')}
          checked={nowPlayingViewEnabled}
          onCheckedChange={setNowPlayingViewEnabled}
        />
        <SettingsToggleRow
          label={t('app.libraryHeroCard')}
          description={t('app.libraryHeroCardDesc')}
          checked={libraryHeroCardEnabled}
          onCheckedChange={setLibraryHeroCardEnabled}
          divider
        />
        <SettingsToggleRow
          label={t('app.lowPerfMode')}
          description={t('app.lowPerfModeDesc')}
          checked={lowPerformanceMode}
          onCheckedChange={setLowPerformanceMode}
          divider
        />
        <SettingsToggleRow
          label={t('app.noiseOverlay')}
          description={t('app.noiseOverlayDesc')}
          checked={noiseOverlayEnabled}
          onCheckedChange={setNoiseOverlayEnabled}
          divider
        />
      </SettingsCard>

      {/* Card 3 — Theme */}
      <SettingsCard icon={Palette} title={t('app.theme.title')} subtitle={t('app.theme.desc')}>
        <div
          role="radiogroup"
          aria-label={t('app.theme.title')}
          className="grid grid-cols-3 gap-2.5"
        >
          {THEME_TILES.map(tile => {
            const isActive = theme === tile.id;
            const name = t(`app.theme.names.${tile.nameKey}`);
            return (
              <button
                key={tile.id}
                role="radio"
                aria-checked={isActive}
                aria-label={t('app.theme.apply', { name })}
                onClick={() => setTheme(tile.id)}
                className={cn(
                  'group relative aspect-video rounded-xl overflow-hidden border text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'border-primary/60 ring-1 ring-primary/40 shadow-[0_0_18px_-4px_rgba(var(--primary-rgb),0.5)]'
                    : 'border-border/40 hover:border-border/60'
                )}
              >
                {tile.thumb ? (
                  <img
                    src={tile.thumb}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 bg-background" />
                )}
                <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  {name}
                </span>
                {isActive && (
                  <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Card 4 — Sidebar */}
      <SettingsCard icon={LayoutGrid} title={t('app.sidebarTitle')}>
        {TOGGLEABLE_SIDEBAR_ITEMS.map((item, index) => (
          <SettingsToggleRow
            key={item.id}
            label={ts(item.key)}
            checked={!sidebarHiddenItems.includes(item.id)}
            onCheckedChange={() => toggleSidebarItem(item.id)}
            divider={index > 0}
          />
        ))}
        <SettingsToggleRow
          label={t('app.sidebarPlaylists')}
          description={t('app.sidebarPlaylistsDesc')}
          checked={sidebarPlaylistsVisible}
          onCheckedChange={setSidebarPlaylistsVisible}
          divider
        />
      </SettingsCard>
    </div>
  );
}
