import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useWeatherStore } from '@/stores/useWeatherStore';
import type { IWeatherSectionView, WeatherLookupState } from './WeatherSection.types';

export function useWeatherSection(): IWeatherSectionView {
  const { t } = useTranslation('overview');
  const enabled = useWeatherStore(s => s.enabled);
  const setEnabled = useWeatherStore(s => s.setEnabled);
  const coords = useWeatherStore(s => s.coords);
  const setCoords = useWeatherStore(s => s.setCoords);

  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<WeatherLookupState>('idle');

  async function searchCity(): Promise<void> {
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

  function onQueryChange(value: string): void {
    setQuery(value);
    if (lookup !== 'idle') setLookup('idle');
  }

  return {
    t,
    enabled,
    coords,
    query,
    lookup,
    onToggleEnabled: setEnabled,
    onClearCity: () => setCoords(null),
    onQueryChange,
    onSearchCity: () => void searchCity(),
  };
}
