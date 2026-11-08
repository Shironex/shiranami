export interface AppEnv {
  /** Default server URL, without a trailing slash. Settings can replace it at runtime. */
  readonly apiUrl: string;
  /** Shared key the server expects in `x-shiranami-key`; empty when the server needs none. */
  readonly apiKey: string;
  /** Shows the YouTube search tab. Off for v0.1, where only local files play. */
  readonly youtubeSearch: boolean;
}

const DEFAULT_API_URL = 'http://localhost:3000';

/**
 * Trims an http(s) URL and drops every trailing slash. Returns null when the
 * value has no http(s) scheme or host, so callers decide how to fail.
 */
export function normalizeHttpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\/[^\s/]+/.test(trimmed)) return null;
  return trimmed.replace(/\/+$/, '');
}

function httpUrl(name: string, value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const url = normalizeHttpUrl(trimmed);
  if (!url) throw new Error(`${name} must be an http(s) URL, got "${trimmed}".`);
  return url;
}

function flag(name: string, value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'false') return false;
  if (trimmed === 'true') return true;
  throw new Error(`${name} must be "true" or "false", got "${trimmed}".`);
}

/**
 * Builds the app config from `EXPO_PUBLIC_*` values. A malformed value stops
 * the app at startup with the variable's name instead of failing later as a
 * vague network error. Every variable is optional: v0.1 plays local files and
 * needs no server.
 */
export function readEnv(source: Record<string, string | undefined>): AppEnv {
  return {
    apiUrl: httpUrl('EXPO_PUBLIC_API_URL', source.EXPO_PUBLIC_API_URL, DEFAULT_API_URL),
    apiKey: source.EXPO_PUBLIC_API_KEY?.trim() ?? '',
    youtubeSearch: flag(
      'EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH',
      source.EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH
    ),
  };
}

// Babel inlines `process.env.EXPO_PUBLIC_*` only when each one is spelled out
// in full, so the object is built by hand instead of passing `process.env`.
export const env: AppEnv = readEnv({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_API_KEY: process.env.EXPO_PUBLIC_API_KEY,
  EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH: process.env.EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH,
});
