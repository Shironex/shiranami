/**
 * Pure payload + signature builders for the two scrobbling backends.
 *
 * No `fetch`, no Electron, no store — just functions that turn a play into the
 * exact wire shape each service expects, plus the Last.fm request signature.
 * Keeping this pure is what lets the fiddly bits (the alphabetical-sort md5
 * signature, the ListenBrainz JSON body, the start-timestamp math) be unit
 * tested without a network. The service layer (`scrobbler.ts`) supplies the
 * md5 primitive and performs the actual HTTP.
 */

/** A single play to scrobble — resolved from the `tracks` row + play event. */
export interface ScrobblePlay {
  artist: string;
  track: string;
  album?: string;
  /** Track length in seconds, when known (Last.fm/LB both accept it). */
  durationSeconds?: number;
  /** Unix epoch SECONDS at which playback STARTED (not the event time). */
  startedAt: number;
}

/**
 * Unix-seconds timestamp a track STARTED, given the play-event instant and how
 * many seconds had played. Last.fm and ListenBrainz both want the start time,
 * not the moment the ~30s/50% threshold tripped.
 */
export function playStartTimestamp(eventMs: number, playedSeconds: number): number {
  const started = Math.floor(eventMs / 1000) - Math.max(0, Math.round(playedSeconds));
  return Math.max(0, started);
}

// ───────────────────────────────── Last.fm ──────────────────────────────────

/**
 * Build the Last.fm `api_sig` signature base string: every signed parameter
 * sorted alphabetically by name, concatenated as `<name><value>` with no
 * separators, then the shared secret appended. The caller md5-hashes this. The
 * `format` and `callback` params are excluded from signing per the Last.fm
 * spec, and so is `api_sig` itself (it does not exist yet).
 */
export function lastfmSignatureBase(params: Record<string, string>, secret: string): string {
  const names = Object.keys(params)
    .filter(name => name !== 'format' && name !== 'callback' && name !== 'api_sig')
    .sort();
  let base = '';
  for (const name of names) base += name + params[name];
  return base + secret;
}

/**
 * The signed Last.fm parameter map for a `track.scrobble` (one track) call,
 * minus `api_sig` — the caller adds `api_sig = md5(lastfmSignatureBase(...))`
 * and `format=json` before posting. Omits empty optional fields so they are
 * neither sent nor signed.
 */
export function lastfmScrobbleParams(
  play: ScrobblePlay,
  apiKey: string,
  sessionKey: string
): Record<string, string> {
  const params: Record<string, string> = {
    method: 'track.scrobble',
    api_key: apiKey,
    sk: sessionKey,
    artist: play.artist,
    track: play.track,
    timestamp: String(play.startedAt),
  };
  if (play.album) params.album = play.album;
  if (play.durationSeconds && play.durationSeconds > 0) {
    params.duration = String(Math.round(play.durationSeconds));
  }
  return params;
}

/** As {@link lastfmScrobbleParams} but for `track.updateNowPlaying` (no
 *  timestamp — it is a transient "currently listening" ping). */
export function lastfmNowPlayingParams(
  play: ScrobblePlay,
  apiKey: string,
  sessionKey: string
): Record<string, string> {
  const params: Record<string, string> = {
    method: 'track.updateNowPlaying',
    api_key: apiKey,
    sk: sessionKey,
    artist: play.artist,
    track: play.track,
  };
  if (play.album) params.album = play.album;
  if (play.durationSeconds && play.durationSeconds > 0) {
    params.duration = String(Math.round(play.durationSeconds));
  }
  return params;
}

/** Params for `auth.getSession` (exchange a desktop-auth token for a session
 *  key). Signed the same way; the caller adds `api_sig` + `format=json`. */
export function lastfmGetSessionParams(apiKey: string, token: string): Record<string, string> {
  return { method: 'auth.getSession', api_key: apiKey, token };
}

// ─────────────────────────────── ListenBrainz ───────────────────────────────

/** ListenBrainz submit-listens body. `listen_type` is `single` for a finished
 *  play or `playing_now` for the now-playing ping. */
export interface ListenBrainzBody {
  listen_type: 'single' | 'playing_now';
  payload: Array<{
    listened_at?: number;
    track_metadata: {
      artist_name: string;
      track_name: string;
      release_name?: string;
      additional_info?: { duration?: number };
    };
  }>;
}

/**
 * Build the ListenBrainz `submit-listens` JSON body. A `playing_now` listen
 * MUST NOT carry `listened_at` (the server rejects it); a `single` listen MUST.
 */
export function listenBrainzBody(
  play: ScrobblePlay,
  listenType: 'single' | 'playing_now'
): ListenBrainzBody {
  const additional_info =
    play.durationSeconds && play.durationSeconds > 0
      ? { duration: Math.round(play.durationSeconds) }
      : undefined;

  const track_metadata: ListenBrainzBody['payload'][number]['track_metadata'] = {
    artist_name: play.artist,
    track_name: play.track,
  };
  if (play.album) track_metadata.release_name = play.album;
  if (additional_info) track_metadata.additional_info = additional_info;

  return {
    listen_type: listenType,
    payload: [
      {
        ...(listenType === 'single' ? { listened_at: play.startedAt } : {}),
        track_metadata,
      },
    ],
  };
}
