/**
 * Stable IPC error codes carried in `IpcError.code` across the bridge.
 *
 * Defined in @shiranami/contracts so both sides agree on the exact literal
 * values: the main process throws `new IpcError(SHARE_ERROR_CODES.X, …)` and the
 * renderer matches on `err.code === SHARE_ERROR_CODES.X`. Keeping them here (not
 * in the desktop-only errors module) lets the renderer reference the same
 * literals and lets the preload↔renderer contract assertion stay strict.
 */

/**
 * Structural check for a structured IPC error, renderer-side.
 *
 * Structural rather than `instanceof` because this value crossed a
 * serialisation boundary and has no prototype left to test — true of Electron's
 * `invoke` in v1 and of Tauri's rejection in v2, for the same reason.
 *
 * Lives here beside the codes, and for the same stated reason: both sides have
 * to agree on the exact predicate. The v1 main process re-exports it from this
 * module, and the v2 bridge shim (`apps/web/src/lib/bridge`) hands it straight
 * back out on `window.electronAPI.errors`.
 */
export function isIpcError(e: unknown): e is { code: string; message: string; details?: unknown } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as Record<string, unknown>).code === 'string'
  );
}

export const SHARE_ERROR_CODES = {
  TRACK_NOT_FOUND: 'share.track_not_found',
  NO_YOUTUBE_MATCH: 'share.no_youtube_match',
  PLAYLIST_NOT_FOUND: 'share.playlist_not_found',
  PLAYLIST_EMPTY: 'share.playlist_empty',
  NO_MATCHES_FOR_ANY_TRACK: 'share.no_matches_for_any_track',
  INVALID_RESPONSE: 'share.invalid_response',
} as const;

export const PLAYLIST_ERROR_CODES = {
  UNSUPPORTED_URL: 'playlist.unsupported_url',
  PRIVATE_PLAYLIST: 'playlist.private',
  NO_TRACKS: 'playlist.no_tracks',
} as const;

export const VALIDATION_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  FORBIDDEN: 'FORBIDDEN',
} as const;

/**
 * Custom-background import refusals.
 *
 * v2-born, so unlike the registries above there is no v1 literal to stay
 * faithful to. Each is a refusal the user can act on, which is why they are four
 * codes and not one: the Appearance card shows a different sentence for each.
 * Failures the user cannot act on (a full disk, a permission error) arrive as
 * `INTERNAL` and get the generic message.
 */
export const BACKGROUND_ERROR_CODES = {
  TOO_LARGE: 'background.too_large',
  UNSUPPORTED_FORMAT: 'background.unsupported_format',
  NOT_AN_IMAGE: 'background.not_an_image',
  DIMENSIONS_TOO_LARGE: 'background.dimensions_too_large',
  LIBRARY_FULL: 'background.library_full',
} as const;

export type ShareErrorCode = (typeof SHARE_ERROR_CODES)[keyof typeof SHARE_ERROR_CODES];
export type PlaylistErrorCode = (typeof PLAYLIST_ERROR_CODES)[keyof typeof PLAYLIST_ERROR_CODES];
export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];
export type BackgroundErrorCode =
  (typeof BACKGROUND_ERROR_CODES)[keyof typeof BACKGROUND_ERROR_CODES];
