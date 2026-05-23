import type { AdvancedStationQuery } from 'radio-browser-api';

/**
 * The composable radio filter set. Every field is optional and AND-combines
 * server-side: each one narrows the result. `tagList` carries multiple genres
 * with AND semantics (all must match); `language` is single-select because the
 * API has no multi-language list parameter.
 */
export interface RadioFilters {
  name?: string;
  countryCode?: string;
  language?: string;
  tagList?: string[];
}

export const RADIO_PAGE_SIZE = 100;

function isFilterActive(filters: RadioFilters): boolean {
  return Boolean(
    filters.name?.trim() ||
    filters.countryCode ||
    filters.language ||
    (filters.tagList && filters.tagList.length > 0)
  );
}

/**
 * Composes a single radio-browser search query from the active filters plus a
 * zero-based page index. Only non-empty dimensions are emitted so an empty
 * filter set falls back to the "top stations" envelope. The shared envelope
 * (order/reverse/hideBroken/limit) matches the previous behavior; `offset` is
 * derived from the page so composed filters can page past the 100 cap.
 */
export function buildStationQuery(filters: RadioFilters, page = 0): AdvancedStationQuery {
  const safePage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  const query: AdvancedStationQuery = {
    limit: RADIO_PAGE_SIZE,
    offset: safePage * RADIO_PAGE_SIZE,
    order: 'clickCount',
    reverse: true,
    hideBroken: true,
  };

  const name = filters.name?.trim();
  if (name) query.name = name;
  if (filters.countryCode) query.countryCode = filters.countryCode;
  if (filters.language) query.language = filters.language;
  if (filters.tagList && filters.tagList.length > 0) query.tagList = filters.tagList;

  return query;
}

/** Whether any filter dimension is set (text or one of the facets). */
export function hasActiveFilters(filters: RadioFilters): boolean {
  return isFilterActive(filters);
}
