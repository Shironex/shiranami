import {
  EMPTY_BODY_SHA256,
  SYNC_ROUTES,
  randomRequestNonce,
  signRequest,
  type FavoritesSnapshot,
  type HistoryPage,
  type LibraryManifestPage,
  type PlaylistsSnapshot,
  type SyncErrorBody,
  type SyncHello,
} from '@shiranami/contracts/sync';

/**
 * The phone's HTTP client for LAN sync v0: plain HTTP to a private address
 * on the home network, every request but pairing signed with the device
 * secret (`SNM1`). Protocol: crates/shiranami-sync/README.md.
 */

/** What the client needs from a response; expo/fetch's Response has all of it. */
export interface SyncResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
  body?: ReadableStream<Uint8Array> | null;
}

export interface SyncRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** `fetch`, injected so tests can answer for the desktop. */
export type SyncFetch = (url: string, init: SyncRequestInit) => Promise<SyncResponse>;

/** Why sync stopped, for the copy in lib/sync-copy.ts. */
export type SyncErrorCode =
  | 'not_private'
  | 'unreachable'
  | 'expired'
  | 'busy'
  | 'denied'
  | 'timeout'
  | 'rate_limited'
  | 'bad_code'
  | 'unverified'
  | 'protocol'
  | 'unpaired'
  | 'too_many_streams'
  | 'storage'
  | 'cancelled'
  | 'failed';

export class SyncError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    message: string = code
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** How long a host gets to answer before the next one is tried. */
export const PROBE_TIMEOUT_MS = 4000;
/** How long a signed JSON request may take on a slow Wi-Fi. */
export const REQUEST_TIMEOUT_MS = 30000;

function octets(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(part => part <= 255) ? parts : null;
}

/**
 * True for an IPv4 address on a home network: RFC 1918 or link-local, the
 * same ranges the desktop listens on. The app may send cleartext to any host
 * (Android cannot scope that by address range), so the sync client refuses
 * everything else itself, whatever a QR code says.
 */
export function isPrivateLanHost(host: string): boolean {
  const ip = octets(host);
  if (!ip) return false;
  const [a, b] = ip;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function baseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

/**
 * Aborts after `ms`, or when `parent` aborts. Returns the signal and a
 * cleanup. (AbortSignal.any and .timeout are not on every Hermes build.)
 */
export function timeoutSignal(
  ms: number,
  parent?: AbortSignal
): { signal: AbortSignal; done: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  parent?.addEventListener('abort', onAbort);
  return {
    signal: controller.signal,
    timedOut: () => expired,
    done: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * The first host that answers anything over HTTP. An unsigned GET is a bare
 * 404 from the desktop, which is enough to know the address is the right
 * one; a host on another network never connects, hence the short timeout.
 */
export async function findHost(
  fetchImpl: SyncFetch,
  hosts: string[],
  port: number,
  signal?: AbortSignal
): Promise<string | null> {
  for (const host of hosts) {
    if (signal?.aborted) throw new SyncError('cancelled');
    const timer = timeoutSignal(PROBE_TIMEOUT_MS, signal);
    try {
      await fetchImpl(`${baseUrl(host, port)}${SYNC_ROUTES.hello}`, {
        method: 'GET',
        headers: {},
        signal: timer.signal,
      });
      return host;
    } catch {
      if (signal?.aborted) throw new SyncError('cancelled');
    } finally {
      timer.done();
    }
  }
  return null;
}

/** Reads a `SyncErrorBody`, if the response carries one. */
export async function errorCodeOf(response: SyncResponse): Promise<string | null> {
  try {
    const body = (await response.json()) as Partial<SyncErrorBody> | null;
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/** A failed signed request as a SyncError. */
export async function requestError(response: SyncResponse): Promise<SyncError> {
  // A bare 404 is every refusal: unknown device, bad signature, stale clock.
  // For a paired phone that means the desktop has forgotten it.
  if (response.status === 404) return new SyncError('unpaired', 'the desktop refused the request');
  const code = await errorCodeOf(response);
  if (response.status === 429) {
    return new SyncError(code === 'too_many_streams' ? 'too_many_streams' : 'rate_limited');
  }
  return new SyncError('failed', `HTTP ${response.status}${code ? ` ${code}` : ''}`);
}

export interface SyncClientOptions {
  fetch: SyncFetch;
  host: string;
  port: number;
  deviceId: string;
  /** The device secret, base64url. */
  secret: string;
  /** Desktop clock minus phone clock, in seconds. */
  skew: number;
  now?: () => number;
  nonce?: () => string;
}

/** Signed requests to one paired desktop at one address. */
export class SyncClient {
  private readonly options: Required<SyncClientOptions>;

  constructor(options: SyncClientOptions) {
    this.options = {
      now: () => Date.now(),
      nonce: randomRequestNonce,
      ...options,
    };
  }

  get host(): string {
    return this.options.host;
  }

  /** The desktop clock, from the phone's plus the skew seen at the last hello. */
  timestamp(): number {
    return Math.floor(this.options.now() / 1000) + this.options.skew;
  }

  setSkew(skew: number): void {
    this.options.skew = skew;
  }

  url(pathAndQuery: string): string {
    return `${baseUrl(this.options.host, this.options.port)}${pathAndQuery}`;
  }

  /** A fresh `Authorization` header: a new nonce every call, never reused. */
  authorization(method: string, pathAndQuery: string): string {
    const { secret, deviceId } = this.options;
    return signRequest(secret, deviceId, {
      method,
      pathAndQuery,
      ts: this.timestamp(),
      nonce: this.options.nonce(),
      bodySha256Hex: EMPTY_BODY_SHA256,
    });
  }

  /** A signed GET or DELETE (v0 sends no signed bodies). */
  async request(
    method: 'GET' | 'DELETE',
    pathAndQuery: string,
    init: { headers?: Record<string, string>; signal?: AbortSignal } = {}
  ): Promise<SyncResponse> {
    return this.options.fetch(this.url(pathAndQuery), {
      method,
      headers: { ...init.headers, Authorization: this.authorization(method, pathAndQuery) },
      signal: init.signal,
    });
  }

  async getJson<T>(pathAndQuery: string, signal?: AbortSignal): Promise<T> {
    const timer = timeoutSignal(REQUEST_TIMEOUT_MS, signal);
    try {
      const response = await this.request('GET', pathAndQuery, { signal: timer.signal });
      if (response.status !== 200) throw await requestError(response);
      return (await response.json()) as T;
    } catch (error) {
      throw asSyncError(error, signal, timer.timedOut());
    } finally {
      timer.done();
    }
  }

  hello(signal?: AbortSignal) {
    return this.getJson<SyncHello>(SYNC_ROUTES.hello, signal);
  }

  manifest(cursor: string | null, signal?: AbortSignal) {
    return this.getJson<LibraryManifestPage>(paged(SYNC_ROUTES.manifest, cursor, 1000), signal);
  }

  playlists(signal?: AbortSignal) {
    return this.getJson<PlaylistsSnapshot>(SYNC_ROUTES.playlists, signal);
  }

  favorites(signal?: AbortSignal) {
    return this.getJson<FavoritesSnapshot>(SYNC_ROUTES.favorites, signal);
  }

  history(cursor: string | null, signal?: AbortSignal) {
    return this.getJson<HistoryPage>(paged(SYNC_ROUTES.history, cursor, 1000), signal);
  }

  /** `DELETE /v1/sync/devices/self`. A 404 means the desktop already forgot this phone. */
  async unpair(signal?: AbortSignal): Promise<void> {
    const timer = timeoutSignal(PROBE_TIMEOUT_MS * 2, signal);
    try {
      const response = await this.request('DELETE', SYNC_ROUTES.unpairSelf, {
        signal: timer.signal,
      });
      if (response.status !== 204 && response.status !== 404) throw await requestError(response);
    } catch (error) {
      throw asSyncError(error, signal, timer.timedOut());
    } finally {
      timer.done();
    }
  }
}

function paged(path: string, cursor: string | null, limit: number): string {
  const cursorPart = cursor ? `cursor=${encodeURIComponent(cursor)}&` : '';
  return `${path}?${cursorPart}limit=${limit}`;
}

/** Any thrown value as a SyncError: a cancel, a timeout, a dropped connection. */
export function asSyncError(error: unknown, signal?: AbortSignal, timedOut = false): SyncError {
  if (error instanceof SyncError) return error;
  if (signal?.aborted) return new SyncError('cancelled');
  if (timedOut) return new SyncError('unreachable', 'the desktop stopped answering');
  return new SyncError('unreachable', error instanceof Error ? error.message : String(error));
}
