import type { WeatherCurrent } from '@shiranami/contracts';

export interface IWeatherRowProps {
  readonly weather: WeatherCurrent | undefined;
  readonly isError: boolean;
  /** "City, Country" label from the geocode, shown faintly under the line. */
  readonly cityLabel?: string;
}

export interface IWeatherRowView {
  /** Weather is missing/errored — render the single "unavailable" line. */
  readonly isUnavailable: boolean;
  /** Localized "unavailable" copy (only meaningful when `isUnavailable`). */
  readonly unavailableLabel: string;
  /** Primary line: "Rain · 12°". */
  readonly weatherLine: string;
  /** Secondary flavor line, optionally prefixed with the city. */
  readonly flavorLine: string;
}
