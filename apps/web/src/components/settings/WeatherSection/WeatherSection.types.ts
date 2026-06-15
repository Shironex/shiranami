import type { useTranslation } from 'react-i18next';
import type { WeatherCoords } from '@/stores/useWeatherStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** State of the city-geocode lookup. */
export type WeatherLookupState = 'idle' | 'searching' | 'no-match' | 'error';

export interface IWeatherSectionView {
  /** Bound `overview`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the weather widget is enabled on the Overview. */
  readonly enabled: boolean;
  /** The saved location, or null when none is set. */
  readonly coords: WeatherCoords | null;
  /** Bound city-search input value. */
  readonly query: string;
  /** Current geocode lookup state. */
  readonly lookup: WeatherLookupState;
  /** Toggle the weather widget on/off. */
  readonly onToggleEnabled: (enabled: boolean) => void;
  /** Clear the saved location. */
  readonly onClearCity: () => void;
  /** Set the city-search input value (resets a stale lookup result). */
  readonly onQueryChange: (value: string) => void;
  /** Run the city geocode lookup for the current query. */
  readonly onSearchCity: () => void;
}
