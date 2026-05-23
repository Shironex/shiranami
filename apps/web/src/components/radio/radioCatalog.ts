import { logger } from '@/lib/logger';
import { radioApi } from './radioApi';

/**
 * A single filter option backed by a radio-browser list endpoint. `value` is
 * the API filter value (ISO-2 code for countries, language/tag name for the
 * others); `count` is the station count radio-browser reports for it.
 */
export interface CatalogEntry {
  value: string;
  count: number;
}

export type CatalogKind = 'countries' | 'languages' | 'tags';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_PREFIX = 'shiranami.radio.catalog.';
const CACHE_VERSION = 1;

interface CachedCatalog {
  version: number;
  fetchedAt: number;
  entries: CatalogEntry[];
}

function cacheKey(kind: CatalogKind): string {
  return `${CACHE_PREFIX}${kind}`;
}

function readCache(kind: CatalogKind): CachedCatalog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(kind: CatalogKind, entries: CatalogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedCatalog = { version: CACHE_VERSION, fetchedAt: Date.now(), entries };
    window.localStorage.setItem(cacheKey(kind), JSON.stringify(payload));
  } catch {
    // Cache is best-effort; a write failure (quota, private mode) is non-fatal.
  }
}

function isStale(cached: CachedCatalog): boolean {
  return Date.now() - cached.fetchedAt > CACHE_TTL_MS;
}

async function fetchCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
  const raw =
    kind === 'countries'
      ? await radioApi.getCountryCodes()
      : kind === 'languages'
        ? await radioApi.getLanguages()
        : await radioApi.getTags();

  return raw
    .filter(item => item.name && item.stationcount > 0)
    .map(item => ({ value: item.name, count: item.stationcount }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Loads a radio-browser catalog (countries / languages / tags) using a
 * stale-while-revalidate strategy: fresh cache is returned immediately, stale
 * cache is returned while a background refresh runs, and a cold start fetches
 * directly. Lists are large and slow-changing, so this avoids re-fetching on
 * every Radio view mount.
 */
export async function loadCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
  const cached = readCache(kind);

  if (cached && !isStale(cached)) {
    return cached.entries;
  }

  if (cached) {
    // Stale: serve cached now, revalidate in the background.
    void fetchCatalog(kind)
      .then(entries => writeCache(kind, entries))
      .catch(err => logger.warn(`[radio] catalog revalidate failed (${kind}):`, err));
    return cached.entries;
  }

  // Cold start: no usable cache, fetch directly.
  const entries = await fetchCatalog(kind);
  writeCache(kind, entries);
  return entries;
}
