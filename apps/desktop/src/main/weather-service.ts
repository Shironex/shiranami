import { app } from 'electron';
import {
  WEATHER_UNAVAILABLE,
  type GeocodeResult,
  type WeatherCondition,
  type WeatherCurrent,
} from '@shiranami/contracts';
import { logger } from './logger';

/**
 * Keyless Open-Meteo weather, ported from lunofi-studio's `WeatherService`.
 * Runs in the Electron main process (native `fetch`, no axios). Only reached
 * after the user opts in and picks a city, so no request fires until then.
 */

const WEATHER_CACHE_TTL_MS = 15 * 60_000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60_000;

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Fair-use identification per Open-Meteo's terms. */
function userAgent(): string {
  let version = '0.0.0';
  try {
    version = app.getVersion();
  } catch {
    // app may be unavailable in unit tests — fall back to a static version.
  }
  return `shiranami-app/${version}`;
}

interface OpenMeteoForecastResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

interface OpenMeteoGeocodeResponse {
  results?: {
    latitude: number;
    longitude: number;
    name: string;
    country?: string;
    admin1?: string;
  }[];
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * WMO interpretation-code mapping. The label matches Open-Meteo's published
 * table; the condition collapses to the shared 8-bucket enum. Codes not in this
 * table fall back to `unknown` / "Weather" and are still treated as a success.
 */
const WMO_CODE_MAP: Record<number, { condition: WeatherCondition; label: string }> = {
  0: { condition: 'clear', label: 'Clear sky' },
  1: { condition: 'partly_cloudy', label: 'Mainly clear' },
  2: { condition: 'partly_cloudy', label: 'Partly cloudy' },
  3: { condition: 'cloudy', label: 'Overcast' },
  45: { condition: 'fog', label: 'Fog' },
  48: { condition: 'fog', label: 'Rime fog' },
  51: { condition: 'rain', label: 'Light drizzle' },
  53: { condition: 'rain', label: 'Drizzle' },
  55: { condition: 'rain', label: 'Heavy drizzle' },
  56: { condition: 'rain', label: 'Freezing drizzle' },
  57: { condition: 'rain', label: 'Freezing drizzle' },
  61: { condition: 'rain', label: 'Light rain' },
  63: { condition: 'rain', label: 'Rain' },
  65: { condition: 'rain', label: 'Heavy rain' },
  66: { condition: 'rain', label: 'Freezing rain' },
  67: { condition: 'rain', label: 'Freezing rain' },
  71: { condition: 'snow', label: 'Light snow' },
  73: { condition: 'snow', label: 'Snow' },
  75: { condition: 'snow', label: 'Heavy snow' },
  77: { condition: 'snow', label: 'Snow grains' },
  80: { condition: 'rain', label: 'Rain showers' },
  81: { condition: 'rain', label: 'Rain showers' },
  82: { condition: 'rain', label: 'Violent rain showers' },
  85: { condition: 'snow', label: 'Snow showers' },
  86: { condition: 'snow', label: 'Heavy snow showers' },
  95: { condition: 'thunderstorm', label: 'Thunderstorm' },
  96: { condition: 'thunderstorm', label: 'Thunderstorm with hail' },
  99: { condition: 'thunderstorm', label: 'Severe thunderstorm with hail' },
};

/** Exposed for unit tests — pure code→bucket mapping. */
export function mapWmoCode(code: number): { condition: WeatherCondition; label: string } {
  return WMO_CODE_MAP[code] ?? { condition: 'unknown', label: 'Weather' };
}

/** Truncate a coord to ~110m precision — the per-tile cache key granularity. */
function cacheCoord(value: number): string {
  return value.toFixed(3);
}

const currentCache = new Map<string, CacheEntry<WeatherCurrent>>();
const geocodeCache = new Map<string, CacheEntry<GeocodeResult>>();

/** Thin `fetch` wrapper: 8s timeout, fair-use UA, throws WEATHER_UNAVAILABLE on any failure. */
async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': userAgent() },
    });
    if (!response.ok) {
      logger.warn(`[weather] Open-Meteo non-2xx (${response.status}): ${url}`);
      throw new Error(WEATHER_UNAVAILABLE);
    }
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message === WEATHER_UNAVAILABLE) throw err;
    logger.warn(`[weather] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new Error(WEATHER_UNAVAILABLE, { cause: err });
  } finally {
    clearTimeout(timeout);
  }
}

/** Current weather for a (lat, lon). Cached 15 min per ~110m tile. */
export async function getCurrentWeather({
  lat,
  lon,
}: {
  lat: number;
  lon: number;
}): Promise<WeatherCurrent> {
  const key = `${cacheCoord(lat)}:${cacheCoord(lon)}`;
  const now = Date.now();
  const cached = currentCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('temperature_unit', 'celsius');

  const data = await fetchJson<OpenMeteoForecastResponse>(url.toString());
  const temp = data.current?.temperature_2m;
  const code = data.current?.weather_code;

  if (typeof temp !== 'number' || typeof code !== 'number') {
    logger.warn(`[weather] malformed forecast payload (lat=${lat}, lon=${lon})`);
    throw new Error(WEATHER_UNAVAILABLE);
  }

  const mapped = mapWmoCode(code);
  const value: WeatherCurrent = {
    tempC: Math.round(temp * 10) / 10,
    condition: mapped.condition,
    label: mapped.label,
  };

  currentCache.set(key, { value, expiresAt: now + WEATHER_CACHE_TTL_MS });
  return value;
}

/**
 * Geocode a free-text city to a single (lat, lon, "City, Country"). Cached 24h
 * per normalized query. Returns `null` (not an error) when there's no match, so
 * the renderer can show a "No matches" hint without a toast.
 */
export async function geocodeCity(query: string): Promise<GeocodeResult | null> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return null;

  const now = Date.now();
  const cached = geocodeCache.get(normalized);
  if (cached && cached.expiresAt > now) return cached.value;

  const url = new URL(OPEN_METEO_GEOCODE_URL);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const data = await fetchJson<OpenMeteoGeocodeResponse>(url.toString());
  const top = data.results?.[0];
  if (!top) return null;

  const labelParts = [top.name];
  if (top.country) labelParts.push(top.country);
  const result: GeocodeResult = {
    lat: top.latitude,
    lon: top.longitude,
    label: labelParts.join(', '),
  };

  geocodeCache.set(normalized, { value: result, expiresAt: now + GEOCODE_CACHE_TTL_MS });
  return result;
}

/** Test-only cache reset. */
export function _clearWeatherCaches(): void {
  currentCache.clear();
  geocodeCache.clear();
}
