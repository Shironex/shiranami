/**
 * Stable IPC error codes carried in `IpcError.code` across the bridge.
 *
 * Defined in @shiranami/contracts so both sides agree on the exact literal
 * values: the main process throws `new IpcError(SHARE_ERROR_CODES.X, …)` and the
 * renderer matches on `err.code === SHARE_ERROR_CODES.X`. Keeping them here (not
 * in the desktop-only errors module) lets the renderer reference the same
 * literals and lets the preload↔renderer contract assertion stay strict.
 */

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

export type ShareErrorCode = (typeof SHARE_ERROR_CODES)[keyof typeof SHARE_ERROR_CODES];
export type PlaylistErrorCode = (typeof PLAYLIST_ERROR_CODES)[keyof typeof PLAYLIST_ERROR_CODES];
export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];
