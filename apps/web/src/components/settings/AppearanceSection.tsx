import { useTranslation } from 'react-i18next';
import { Languages, Sparkles, LayoutGrid, Palette, RotateCcw } from 'lucide-react';
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
import { useThemeStore } from '@/stores/useThemeStore';
import {
  useThemeBgStore,
  THEME_BG_OPACITY_MIN,
  THEME_BG_OPACITY_MAX,
  THEME_BG_OPACITY_STEP,
  THEME_BG_OPACITY_DEFAULT,
  THEME_BG_BLUR_MIN,
  THEME_BG_BLUR_MAX,
  THEME_BG_BLUR_STEP,
  THEME_BG_BLUR_DEFAULT,
  THEME_BG_DIM_MIN,
  THEME_BG_DIM_MAX,
  THEME_BG_DIM_STEP,
  THEME_BG_DIM_DEFAULT,
} from '@/stores/useThemeBgStore';
import type { AppView } from '@/stores/useViewStore';
import { cn } from '@/lib/utils';
import { ThemeTileGrid } from '@/components/shared/theme/ThemeTileGrid';
import { SUPPORTED_LANGUAGES, persistLanguage, type SupportedLanguage } from '@/lib/i18n';

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
  const bgOpacity = useThemeBgStore(s => s.bgOpacity);
  const setBgOpacity = useThemeBgStore(s => s.setBgOpacity);
  const bgBlur = useThemeBgStore(s => s.bgBlur);
  const setBgBlur = useThemeBgStore(s => s.setBgBlur);
  const bgDim = useThemeBgStore(s => s.bgDim);
  const setBgDim = useThemeBgStore(s => s.setBgDim);
  const resetBg = useThemeBgStore(s => s.resetBg);

  const isBgModified =
    bgOpacity !== THEME_BG_OPACITY_DEFAULT ||
    bgBlur !== THEME_BG_BLUR_DEFAULT ||
    bgDim !== THEME_BG_DIM_DEFAULT;

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
        <ThemeTileGrid value={theme} onSelect={setTheme} />

        {theme !== 'none' && (
          <div className="px-3 pt-4 border-t border-border/40 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.title')}</p>
              {isBgModified && (
                <button
                  onClick={resetBg}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('app.bgAdjust.reset')}
                >
                  <RotateCcw className="size-3" />
                  {t('app.bgAdjust.reset')}
                </button>
              )}
            </div>

            {/* Opacity */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.opacity')}</p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(bgOpacity * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.opacityDesc')}</p>
              <Slider
                min={THEME_BG_OPACITY_MIN}
                max={THEME_BG_OPACITY_MAX}
                step={THEME_BG_OPACITY_STEP}
                value={[bgOpacity]}
                onValueChange={([v]) => setBgOpacity(v)}
              />
            </div>

            {/* Blur */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.blur')}</p>
                <span className="text-xs tabular-nums text-muted-foreground">{bgBlur}px</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.blurDesc')}</p>
              <Slider
                min={THEME_BG_BLUR_MIN}
                max={THEME_BG_BLUR_MAX}
                step={THEME_BG_BLUR_STEP}
                value={[bgBlur]}
                onValueChange={([v]) => setBgBlur(v)}
              />
            </div>

            {/* Dim */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.dim')}</p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(bgDim * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.dimDesc')}</p>
              <Slider
                min={THEME_BG_DIM_MIN}
                max={THEME_BG_DIM_MAX}
                step={THEME_BG_DIM_STEP}
                value={[bgDim]}
                onValueChange={([v]) => setBgDim(v)}
              />
            </div>
          </div>
        )}
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
