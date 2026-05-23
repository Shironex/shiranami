import { useQuery } from '@tanstack/react-query';
import { IS_ELECTRON } from '@/lib/platform';
import type { WeatherCurrent } from '@shiranami/contracts';
import type { WeatherCoords } from '@/stores/useWeatherStore';

/** Open-Meteo updates upstream every ~15 min; match that on the client. */
const WEATHER_STALE_MS = 15 * 60 * 1000;

export const weatherKeys = {
  current: (lat: number, lon: number) =>
    // Round to ~110m so tiny coord jitter doesn't fragment the cache.
    ['weather', 'current', lat.toFixed(3), lon.toFixed(3)] as const,
};

/**
 * Current weather for the user's chosen city. Disabled until the user opts in
 * AND a city is set, so no request fires by default. Failures surface as the
 * query's `isError` — the card shows a quiet "Weather unavailable" line.
 */
export function useWeatherQuery(enabled: boolean, coords: WeatherCoords | null) {
  return useQuery({
    queryKey: coords ? weatherKeys.current(coords.lat, coords.lon) : ['weather', 'disabled'],
    queryFn: async (): Promise<WeatherCurrent> => {
      if (!coords) throw new Error('no_coords');
      return window.electronAPI.weather.getCurrent({ lat: coords.lat, lon: coords.lon });
    },
    enabled: IS_ELECTRON && enabled && coords !== null,
    staleTime: WEATHER_STALE_MS,
    retry: 1,
  });
}
