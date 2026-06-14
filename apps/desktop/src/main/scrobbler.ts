/**
 * Scrobbler service (Last.fm + ListenBrainz).
 *
 * Opt-in, main-process only. On the local play event (~30s / 50%, computed in
 * the renderer and recorded via `db:history:record-play`) the history handler
 * calls {@link submitPlay} fire-and-forget. We submit a "now playing" ping and
 * a scrobble to each connected backend. Nothing here is ever awaited on the
 * playback path, and every failure is caught — a failed submission is parked in
 * an in-memory retry queue with exponential backoff and a periodic flush.
 *
 * Secrets (the Last.fm session key / ListenBrainz token) live in the main-only
 * `scrobble.settings` store key and never round-trip to the renderer, which
 * reads back only a {@link ScrobbleStatus}. The pure payload + signature
 * builders and the retry-queue state machine live in `./scrobble/` and are unit
 * tested; this module is the thin store + fetch + timer shell around them.
 */

import { createHash } from 'node:crypto';
import { shell } from 'electron';
import type {
  ScrobbleStatus,
  LastfmConnectResult,
  ListenBrainzConnectResult,
} from '@shiranami/contracts';
import { store } from './app/store';
import { logger } from './app/logger';
import {
  lastfmSignatureBase,
  lastfmScrobbleParams,
  lastfmNowPlayingParams,
  lastfmGetSessionParams,
  listenBrainzBody,
  playStartTimestamp,
  type ScrobblePlay,
} from './scrobble/scrobble-payload';
import {
  enqueue,
  dueItems,
  markRetried,
  remove,
  type QueuedScrobble,
  type ScrobbleTarget,
} from './scrobble/scrobble-queue';

const LASTFM_ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';
const LISTENBRAINZ_ENDPOINT = 'https://api.listenbrainz.org/1/submit-listens';
const LISTENBRAINZ_VALIDATE = 'https://api.listenbrainz.org/1/validate-token';

/** How often the retry queue is flushed. */
const FLUSH_INTERVAL_MS = 60_000;

/**
 * Per-request timeout for the background submission fetches. Without it a hung
 * network connection would keep the request (and its retry slot) open forever; a
 * timeout makes it fail fast and requeue for the next flush.
 */
const SUBMIT_TIMEOUT_MS = 10_000;

/**
 * Per-request timeout for the IPC-facing auth/validation fetches. Without it a
 * stalled connection would leave the settings flow pending indefinitely and pin
 * the renderer in a loading state; the timeout makes it fail fast into the
 * existing error path.
 */
const AUTH_TIMEOUT_MS = 10_000;

/**
 * Last.fm api_key + shared secret. Last.fm requires a registered application
 * key/secret to sign every authenticated call; they are read from the env at
 * build/run time. When unset, the Last.fm features stay disabled (the UI shows
 * Last.fm as unavailable) while ListenBrainz — which needs only the user token
 * — works regardless.
 */
const LASTFM_API_KEY = process.env.SHIRANAMI_LASTFM_API_KEY ?? '';
const LASTFM_SECRET = process.env.SHIRANAMI_LASTFM_SECRET ?? '';

interface ScrobbleSettings {
  enabled: boolean;
  lastfmSessionKey: string | null;
  lastfmUsername: string | null;
  listenBrainzToken: string | null;
}

const DEFAULT_SETTINGS: ScrobbleSettings = {
  enabled: false,
  lastfmSessionKey: null,
  lastfmUsername: null,
  listenBrainzToken: null,
};

let queue: QueuedScrobble[] = [];
let flushTimer: NodeJS.Timeout | null = null;
/** Guards against overlapping flushes (a slow tick must not run twice). */
let isFlushing = false;

function getSettings(): ScrobbleSettings {
  return { ...DEFAULT_SETTINGS, ...(store.get('scrobble.settings') ?? {}) };
}

function setSettings(updates: Partial<ScrobbleSettings>): ScrobbleSettings {
  const next = { ...getSettings(), ...updates };
  store.set('scrobble.settings', next);
  return next;
}

/** True when the Last.fm app key/secret are configured for this build. */
export function isLastfmConfigured(): boolean {
  return Boolean(LASTFM_API_KEY && LASTFM_SECRET);
}

// ─────────────────────────────── public status ──────────────────────────────

export function getScrobbleStatus(): ScrobbleStatus {
  const settings = getSettings();
  return {
    enabled: settings.enabled,
    lastfmConnected: Boolean(settings.lastfmSessionKey),
    lastfmUsername: settings.lastfmUsername,
    listenBrainzConnected: Boolean(settings.listenBrainzToken),
    pendingCount: queue.length,
  };
}

export function setScrobbleEnabled(enabled: boolean): ScrobbleStatus {
  setSettings({ enabled });
  return getScrobbleStatus();
}

// ───────────────────────────────── Last.fm ──────────────────────────────────

/** md5-sign a Last.fm param map and return the full body (incl. api_sig + json). */
function signLastfm(params: Record<string, string>): URLSearchParams {
  const api_sig = createHash('md5')
    .update(lastfmSignatureBase(params, LASTFM_SECRET), 'utf8')
    .digest('hex');
  return new URLSearchParams({ ...params, api_sig, format: 'json' });
}

/**
 * Begin Last.fm desktop auth: open the user's browser to the auth page for a
 * freshly-minted request token, and return that token so the renderer can pass
 * it back to {@link completeLastfmAuth} after the user approves.
 */
export async function beginLastfmAuth(): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!isLastfmConfigured()) return { ok: false, error: 'not_configured' };
  try {
    const params = { method: 'auth.getToken', api_key: LASTFM_API_KEY };
    const res = await fetch(`${LASTFM_ENDPOINT}?${signLastfm(params).toString()}`, {
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    const json = (await res.json()) as { token?: string };
    if (!json.token) return { ok: false, error: 'no_token' };
    await shell.openExternal(
      `https://www.last.fm/api/auth/?api_key=${LASTFM_API_KEY}&token=${json.token}`
    );
    return { ok: true, token: json.token };
  } catch (err) {
    logger.warn('[scrobble] last.fm begin-auth failed', err);
    return { ok: false, error: 'network' };
  }
}

/**
 * Finish Last.fm desktop auth: exchange the approved token for an infinite
 * session key and store it. The token is single-use.
 */
export async function completeLastfmAuth(token: string): Promise<LastfmConnectResult> {
  if (!isLastfmConfigured()) return { ok: false, error: 'not_configured' };
  try {
    const body = signLastfm(lastfmGetSessionParams(LASTFM_API_KEY, token));
    const res = await fetch(`${LASTFM_ENDPOINT}?${body.toString()}`, {
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      session?: { key?: string; name?: string };
      error?: number;
    };
    if (!json.session?.key) return { ok: false, error: 'no_session' };
    setSettings({
      enabled: true,
      lastfmSessionKey: json.session.key,
      lastfmUsername: json.session.name ?? null,
    });
    return { ok: true, username: json.session.name ?? null };
  } catch (err) {
    logger.warn('[scrobble] last.fm complete-auth failed', err);
    return { ok: false, error: 'network' };
  }
}

export function disconnectLastfm(): ScrobbleStatus {
  setSettings({ lastfmSessionKey: null, lastfmUsername: null });
  return getScrobbleStatus();
}

/** Submit one play to Last.fm (now-playing then scrobble). Throws on failure. */
async function sendLastfm(play: ScrobblePlay, sessionKey: string): Promise<void> {
  // Now-playing is a best-effort transient ping; a failure there must not block
  // the scrobble, so it is fired and its rejection swallowed.
  void fetch(LASTFM_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: signLastfm(lastfmNowPlayingParams(play, LASTFM_API_KEY, sessionKey)),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  }).catch(() => {});

  const res = await fetch(LASTFM_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: signLastfm(lastfmScrobbleParams(play, LASTFM_API_KEY, sessionKey)),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`lastfm scrobble http ${res.status}`);
  // Last.fm returns HTTP 200 with an `error` code in the body for API-level
  // failures (bad session, rate limit, …), so the body must be inspected too —
  // an HTTP-200 error should still requeue for retry.
  const json = (await res.json().catch(() => ({}))) as { error?: number };
  if (json.error) throw new Error(`lastfm scrobble api error ${json.error}`);
}

// ─────────────────────────────── ListenBrainz ───────────────────────────────

export async function connectListenBrainz(token: string): Promise<ListenBrainzConnectResult> {
  try {
    const res = await fetch(LISTENBRAINZ_VALIDATE, {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    const json = (await res.json()) as { valid?: boolean; user_name?: string };
    if (!json.valid) return { ok: false, error: 'invalid_token' };
    setSettings({ enabled: true, listenBrainzToken: token });
    return { ok: true, username: json.user_name ?? null };
  } catch (err) {
    logger.warn('[scrobble] listenbrainz connect failed', err);
    return { ok: false, error: 'network' };
  }
}

export function disconnectListenBrainz(): ScrobbleStatus {
  setSettings({ listenBrainzToken: null });
  return getScrobbleStatus();
}

/** Submit one play to ListenBrainz (playing_now then single). Throws on failure. */
async function sendListenBrainz(play: ScrobblePlay, token: string): Promise<void> {
  void fetch(LISTENBRAINZ_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(listenBrainzBody(play, 'playing_now')),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  }).catch(() => {});

  const res = await fetch(LISTENBRAINZ_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(listenBrainzBody(play, 'single')),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`listenbrainz submit http ${res.status}`);
}

// ─────────────────────────── submit + retry queue ───────────────────────────

/**
 * Try to submit `play` to each requested target. Returns the targets that
 * FAILED (empty = full success). Each target is independent — one failing does
 * not abort the other.
 */
async function submitTargets(
  play: ScrobblePlay,
  targets: ScrobbleTarget[],
  settings: ScrobbleSettings
): Promise<ScrobbleTarget[]> {
  const failed: ScrobbleTarget[] = [];
  await Promise.all(
    targets.map(async target => {
      try {
        if (target === 'lastfm') {
          // Credentials absent (disconnected/not configured): retain for a later
          // flush instead of silently dropping the play.
          if (!settings.lastfmSessionKey || !isLastfmConfigured()) {
            failed.push(target);
            return;
          }
          await sendLastfm(play, settings.lastfmSessionKey);
        } else if (target === 'listenbrainz') {
          if (!settings.listenBrainzToken) {
            failed.push(target);
            return;
          }
          await sendListenBrainz(play, settings.listenBrainzToken);
        }
      } catch (err) {
        logger.warn(`[scrobble] ${target} submit failed; will retry`, err);
        failed.push(target);
      }
    })
  );
  return failed;
}

/** Targets currently connected, honoring the master switch. */
function activeTargets(settings: ScrobbleSettings): ScrobbleTarget[] {
  if (!settings.enabled) return [];
  const targets: ScrobbleTarget[] = [];
  if (settings.lastfmSessionKey && isLastfmConfigured()) targets.push('lastfm');
  if (settings.listenBrainzToken) targets.push('listenbrainz');
  return targets;
}

/**
 * Fire-and-forget entry point called from the history record-play handler. Never
 * throws and never blocks: it returns immediately and the submission runs in the
 * background. A play with no artist/track (e.g. a bare radio entry) is skipped.
 */
export function submitPlay(input: {
  artist: string;
  track: string;
  album?: string | null;
  durationSeconds?: number | null;
  playedSeconds: number;
}): void {
  const settings = getSettings();
  const targets = activeTargets(settings);
  if (targets.length === 0) return;
  if (!input.artist.trim() || !input.track.trim()) return;

  const play: ScrobblePlay = {
    artist: input.artist,
    track: input.track,
    album: input.album ?? undefined,
    durationSeconds: input.durationSeconds ?? undefined,
    startedAt: playStartTimestamp(Date.now(), input.playedSeconds),
  };

  void submitTargets(play, targets, settings)
    .then(failed => {
      if (failed.length === 0) return;
      queue = enqueue(queue, {
        id: createHash('md5')
          .update(`${play.artist}|${play.track}|${play.startedAt}`)
          .digest('hex'),
        artist: play.artist,
        track: play.track,
        album: play.album,
        durationSeconds: play.durationSeconds,
        startedAt: play.startedAt,
        targets: failed,
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
    })
    .catch(err => logger.warn('[scrobble] submit error', err));
}

/** Retry every due parked scrobble once. Driven by the flush timer. */
async function flushQueue(): Promise<void> {
  // A flush can outlive its interval tick on a slow network; without this guard a
  // later tick would reprocess the same still-pending items and double-scrobble.
  if (isFlushing) return;
  isFlushing = true;
  try {
    const settings = getSettings();
    if (!settings.enabled) return;
    const now = Date.now();
    const due = dueItems(queue, now);
    for (const item of due) {
      const play: ScrobblePlay = {
        artist: item.artist,
        track: item.track,
        album: item.album,
        durationSeconds: item.durationSeconds,
        startedAt: item.startedAt,
      };
      const failed = await submitTargets(play, item.targets, settings);
      queue =
        failed.length === 0 ? remove(queue, item.id) : markRetried(queue, item.id, failed, now);
    }
  } finally {
    isFlushing = false;
  }
}

/** Start the periodic retry flush. Idempotent; called on app bootstrap. */
export function startScrobbler(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushQueue().catch(err => logger.warn('[scrobble] flush failed', err));
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

/** Stop the retry flush (teardown). */
export function stopScrobbler(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
