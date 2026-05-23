// Weather contracts shared between the desktop main process (Open-Meteo proxy)
// and the renderer. Ported from lunofi-studio's weather module — keyless
// Open-Meteo, collapsed to an 8-bucket condition enum.

/**
 * Coarse weather condition. Open-Meteo's ~28 WMO interpretation codes collapse
 * to these buckets so the renderer only switches on a small set when picking a
 * glyph/icon.
 */
export type WeatherCondition =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'unknown';

export const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
  'clear',
  'partly_cloudy',
  'cloudy',
  'rain',
  'snow',
  'thunderstorm',
  'fog',
  'unknown',
] as const;

export interface WeatherCurrent {
  /** Temperature in degrees Celsius (rounded to 0.1°). */
  tempC: number;
  condition: WeatherCondition;
  /** Short human label from the WMO table ("Clear sky", "Light rain", …). English. */
  label: string;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  /** Human label: "City, Country". */
  label: string;
}

/** Stable error code thrown when the upstream weather lookup fails. */
export const WEATHER_UNAVAILABLE = 'WEATHER_UNAVAILABLE';
