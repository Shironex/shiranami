import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudSun, Info, Loader2, MapPin, Search, X } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { useWeatherStore } from '@/stores/useWeatherStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';

type LookupState = 'idle' | 'searching' | 'no-match' | 'error';

export function WeatherSection() {
  const { t } = useTranslation('overview');
  const enabled = useWeatherStore(s => s.enabled);
  const setEnabled = useWeatherStore(s => s.setEnabled);
  const coords = useWeatherStore(s => s.coords);
  const setCoords = useWeatherStore(s => s.setCoords);

  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<LookupState>('idle');

  async function searchCity() {
    const trimmed = query.trim();
    if (!trimmed || !IS_ELECTRON) return;
    setLookup('searching');
    try {
      const result = await window.electronAPI.weather.geocode(trimmed);
      if (!result) {
        setLookup('no-match');
        return;
      }
      setCoords({ lat: result.lat, lon: result.lon, label: result.label });
      setQuery('');
      setLookup('idle');
    } catch {
      setLookup('error');
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={CloudSun}
        title={t('weatherSettings.title')}
        subtitle={t('weatherSettings.subtitle')}
      >
        <SettingsToggleRow
          label={t('weatherSettings.toggleLabel')}
          description={t('weatherSettings.toggleDesc')}
          checked={enabled}
          onCheckedChange={setEnabled}
        />

        {enabled && (
          <div className="space-y-3 border-t border-border/30 pt-4">
            {coords && (
              <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-surface/50 px-3 py-2.5">
                <MapPin className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {t('weatherSettings.currentCity', { label: coords.label })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCoords(null)}
                  aria-label={t('weatherSettings.clearCity')}
                  className="size-7 shrink-0 p-0"
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            <form
              className="flex items-center gap-2"
              onSubmit={e => {
                e.preventDefault();
                void searchCity();
              }}
            >
              <Input
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  if (lookup !== 'idle') setLookup('idle');
                }}
                placeholder={t('weatherSettings.cityPlaceholder')}
                aria-label={t('weatherSettings.cityLabel')}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={lookup === 'searching' || query.trim().length === 0}
              >
                {lookup === 'searching' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {lookup === 'searching'
                  ? t('weatherSettings.searching')
                  : t('weatherSettings.searchButton')}
              </Button>
            </form>

            {lookup === 'no-match' && (
              <p className="text-xs text-muted-foreground">{t('weatherSettings.noMatches')}</p>
            )}
            {lookup === 'error' && (
              <p className="text-xs text-destructive">{t('weatherSettings.lookupError')}</p>
            )}
            <p className="text-xs text-muted-foreground/70">{t('weatherSettings.cityHelp')}</p>
          </div>
        )}
      </SettingsCard>

      <SettingsInfoCallout icon={Info}>{t('weatherSettings.note')}</SettingsInfoCallout>
    </div>
  );
}
