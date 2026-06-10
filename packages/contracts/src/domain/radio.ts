// Domain types for saved internet-radio stations (the `radio:favorites:*` IPC
// surface). A favorite is persisted in the `radio_favorites` table and mirrors
// a station from the radio-browser directory; the renderer projects these rows
// back into the radio-browser `Station` shape for display.

/**
 * The station fields the renderer sends when saving a favorite. Optional fields
 * are omitted (sent as `undefined`) when the source station has no value.
 */
export interface RadioStationInput {
  stationUuid: string;
  name: string;
  url: string;
  urlResolved: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  countryCode?: string;
  language?: string;
  codec?: string;
  bitrate?: number;
  tags?: string;
}

/**
 * A persisted radio favorite as returned by `getAll` / `add`. Mirrors the
 * `radio_favorites` row: the server assigns `id` and `createdAt`, and nullable
 * columns come back as `null` (not `undefined`) over the IPC boundary.
 */
export interface RadioFavorite {
  id: string;
  stationUuid: string;
  name: string;
  url: string;
  urlResolved: string;
  homepage: string | null;
  favicon: string | null;
  country: string | null;
  countryCode: string | null;
  language: string | null;
  codec: string | null;
  bitrate: number | null;
  tags: string | null;
  createdAt: string;
}
