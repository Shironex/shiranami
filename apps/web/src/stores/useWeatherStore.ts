import { createPersistedStore, acceptStoreHmr } from '@/lib/createPersistedStore';

/** localStorage key — matches the shiranami.* store convention. */
const STORE_KEY = 'shiranami.weather';

export interface WeatherCoords {
  lat: number;
  lon: number;
  /** "City, Country" label resolved at geocode time, shown under the temp. */
  label: string;
}

interface WeatherState {
  /**
   * Opt-in: show the current weather on the Overview clock card. Default OFF.
   * No network request fires until this is true AND `coords` is set.
   */
  enabled: boolean;
  /** Resolved city coordinates (set via the Settings city picker). */
  coords: WeatherCoords | null;
  setEnabled: (value: boolean) => void;
  setCoords: (coords: WeatherCoords | null) => void;
}

function coerceCoords(v: unknown): WeatherCoords | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (typeof c.lat !== 'number' || typeof c.lon !== 'number') return null;
  return { lat: c.lat, lon: c.lon, label: typeof c.label === 'string' ? c.label : '' };
}

export const useWeatherStore = createPersistedStore<WeatherState>(
  set => ({
    enabled: false,
    coords: null,
    setEnabled: value => set({ enabled: value }),
    setCoords: coords => set({ coords }),
  }),
  {
    name: STORE_KEY,
    version: 1,
    partialize: s => ({ enabled: s.enabled, coords: s.coords }),
    sanitize: (persisted, current) => {
      const p = persisted as Partial<WeatherState> | undefined;
      return {
        ...current,
        enabled: p?.enabled === true,
        coords: coerceCoords(p?.coords),
      };
    },
  }
);

acceptStoreHmr(useWeatherStore, import.meta.hot, state => {
  useWeatherStore.setState({
    enabled: state.enabled === true,
    coords: coerceCoords(state.coords),
  });
});
