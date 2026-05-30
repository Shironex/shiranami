// Scrobbling contracts shared between the desktop main process (the scrobbler
// service that submits to Last.fm / ListenBrainz) and the renderer Settings UI.
//
// The renderer NEVER sees the raw Last.fm session key or ListenBrainz token —
// those stay main-only. It reads back only this connection status and writes
// credentials in through dedicated IPC.

/**
 * The scrobbling connection status the Settings UI renders. Carries booleans +
 * the display username only — never the underlying secrets.
 */
export interface ScrobbleStatus {
  /** Master opt-in switch. When false, nothing is submitted. */
  enabled: boolean;
  /** True when a Last.fm session key is stored. */
  lastfmConnected: boolean;
  /** Last.fm display name, when connected. */
  lastfmUsername: string | null;
  /** True when a ListenBrainz user token is stored. */
  listenBrainzConnected: boolean;
  /** Number of plays parked in the in-memory retry queue (failed submissions). */
  pendingCount: number;
}

/** Result of connecting Last.fm via the desktop-auth token exchange. */
export type LastfmConnectResult =
  | { ok: true; username: string | null }
  /** `error` is a short reason key for the UI toast. */
  | { ok: false; error: string };

/** Result of connecting ListenBrainz by validating a user token. */
export type ListenBrainzConnectResult =
  | { ok: true; username: string | null }
  | { ok: false; error: string };
