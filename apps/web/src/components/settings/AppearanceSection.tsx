import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  useAppStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
  type AppView,
} from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
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
  const uiScale = useAppStore((s) => s.uiScale);
  const setUiScale = useAppStore((s) => s.setUiScale);
  const resetUiScale = useAppStore((s) => s.resetUiScale);
  const nowPlayingViewEnabled = useAppStore((s) => s.nowPlayingViewEnabled);
  const setNowPlayingViewEnabled = useAppStore((s) => s.setNowPlayingViewEnabled);
  const libraryHeroCardEnabled = useAppStore((s) => s.libraryHeroCardEnabled);
  const setLibraryHeroCardEnabled = useAppStore((s) => s.setLibraryHeroCardEnabled);
  const lowPerformanceMode = useAppStore((s) => s.lowPerformanceMode);
  const setLowPerformanceMode = useAppStore((s) => s.setLowPerformanceMode);
  const sidebarHiddenItems = useAppStore((s) => s.sidebarHiddenItems);
  const toggleSidebarItem = useAppStore((s) => s.toggleSidebarItem);
  const sidebarPlaylistsVisible = useAppStore((s) => s.sidebarPlaylistsVisible);
  const setSidebarPlaylistsVisible = useAppStore((s) => s.setSidebarPlaylistsVisible);

  function handleLanguageChange(lang: SupportedLanguage) {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  }

  return (
    <SettingsCard
      icon={Monitor}
      title={t('app.title')}
      subtitle={t('app.subtitle')}
    >
      <div className="space-y-6">
        {/* Language */}
        <div className="px-3">
          <p className="text-sm font-medium text-foreground mb-1">{t('app.languageTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {t('app.languageDesc')}
          </p>
          <div className="flex items-center gap-1.5">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  i18n.language === lang.code
                    ? 'bg-primary/15 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent',
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
            <span className="text-xs tabular-nums text-muted-foreground">
              {uiScale}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {t('app.scaleDesc')}
          </p>

          <Slider
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={UI_SCALE_STEP}
            value={[uiScale]}
            onValueChange={([v]) => setUiScale(v)}
          />

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-1.5">
              {UI_SCALE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setUiScale(preset)}
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                    uiScale === preset
                      ? 'bg-primary/15 text-primary border border-primary/40'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent',
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

        {/* Now Playing view */}
        <div className="px-3">
          <div className="flex items-center justify-between py-2.5 rounded-xl hover:bg-accent/30 transition-colors px-3 -mx-3">
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                {t('app.nowPlayingView')}
                <StatusBadge variant="new">{t('app.new')}</StatusBadge>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('app.nowPlayingViewDesc')}</p>
            </div>
            <Switch
              checked={nowPlayingViewEnabled}
              onChange={setNowPlayingViewEnabled}
            />
          </div>
        </div>

        {/* Now Playing banner (hero card above Library/Favorites) */}
        <div className="px-3">
          <div className="flex items-center justify-between py-2.5 rounded-xl hover:bg-accent/30 transition-colors px-3 -mx-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t('app.libraryHeroCard')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('app.libraryHeroCardDesc')}</p>
            </div>
            <Switch
              checked={libraryHeroCardEnabled}
              onChange={setLibraryHeroCardEnabled}
            />
          </div>
        </div>

        {/* Low performance mode — disables expensive visual effects */}
        <div className="px-3">
          <div className="flex items-center justify-between py-2.5 rounded-xl hover:bg-accent/30 transition-colors px-3 -mx-3">
            <div className="pr-4">
              <p className="text-sm font-medium text-foreground">{t('app.lowPerfMode')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('app.lowPerfModeDesc')}</p>
            </div>
            <Switch
              checked={lowPerformanceMode}
              onChange={setLowPerformanceMode}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="px-3">
          <p className="text-sm font-medium text-foreground mb-1">{t('app.sidebarTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {t('app.sidebarDesc')}
          </p>
          <div className="space-y-1">
            {TOGGLEABLE_SIDEBAR_ITEMS.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-accent/30 transition-colors"
              >
                <p className="text-sm text-foreground">{ts(item.key)}</p>
                <Switch
                  checked={!sidebarHiddenItems.includes(item.id)}
                  onChange={() => toggleSidebarItem(item.id)}
                />
              </div>
            ))}

            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-accent/30 transition-colors">
              <div>
                <p className="text-sm text-foreground">{t('app.sidebarPlaylists')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('app.sidebarPlaylistsDesc')}
                </p>
              </div>
              <Switch
                checked={sidebarPlaylistsVisible}
                onChange={setSidebarPlaylistsVisible}
              />
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
