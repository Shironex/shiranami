export class IpcError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Structural check for IpcError on the renderer side.
 * Electron strips the prototype across IPC; instanceof won't work renderer-side.
 */
export function isIpcError(
  e: unknown,
): e is { code: string; message: string; details?: unknown } {
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
} as const;

export const PLAYLIST_ERROR_CODES = {
  UNSUPPORTED_URL: 'playlist.unsupported_url',
  PRIVATE_PLAYLIST: 'playlist.private',
  NO_TRACKS: 'playlist.no_tracks',
} as const;

export const VALIDATION_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
} as const;
