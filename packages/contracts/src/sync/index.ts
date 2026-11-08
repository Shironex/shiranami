// `@shiranami/contracts/sync`: the LAN sync v0 contract for the phone client.
//
// Tauri-free on purpose: the root `@shiranami/contracts` entry is fine for the
// desktop renderer, but the generated Tauri bindings import `@tauri-apps/api`,
// which a React Native bundle cannot load. This subpath only re-exports the
// generated wire types (from `crates/shiranami-sync/src/wire.rs`) plus pure
// helpers: parsing the QR link and building the exact strings the desktop
// signs. The phone supplies HMAC-SHA256 and SHA-256 itself; nothing here
// depends on a crypto library.
//
// Protocol reference: crates/shiranami-sync/README.md. The constants below are
// mirrored from the Rust crate and pinned by a test there.

export type * from '../generated/sync';

/** The protocol version: the `v1` in every path and `v=` in the QR link. */
export const SYNC_PROTOCOL_VERSION = 1;

/** The `Authorization` scheme and the first line of every signed payload. */
export const SYNC_AUTH_SCHEME = 'SNM1';

/** How far a request `ts` may be from the desktop clock, in seconds. */
export const SYNC_MAX_SKEW_SECONDS = 120;

/** Domain separator of the pairing proof. */
export const SYNC_PAIR_PROOF_CONTEXT = 'shiranami-sync/v1/pair';

/** Domain separator of the device secret derivation. */
export const SYNC_DEVICE_SECRET_CONTEXT = 'shiranami-sync/v1/device-secret';

/** The DNS-SD service type the desktop advertises while sync is on. */
export const SYNC_SERVICE_TYPE = '_shiranami._tcp';

/** What a pairing QR payload starts with. */
export const SYNC_PAIR_LINK_PREFIX = 'shiranami://pair?';

/** Every v0 route. Paths only; prefix with `http://<host>:<port>`. */
export const SYNC_ROUTES = {
  pair: '/v1/sync/pair',
  hello: '/v1/sync/hello',
  manifest: '/v1/sync/manifest',
  playlists: '/v1/sync/playlists',
  favorites: '/v1/sync/favorites',
  history: '/v1/sync/history',
  art: (hash: string) => `/v1/sync/art/${encodeURIComponent(hash)}`,
  audio: (trackId: string) => `/v1/sync/tracks/${encodeURIComponent(trackId)}/audio`,
  unpairSelf: '/v1/sync/devices/self',
} as const;

/** The fields of a scanned `shiranami://pair?...` link. */
export interface SyncPairingLink {
  /** `v`: protocol version. */
  version: number;
  /** `h`: host candidates, try in order. */
  hosts: string[];
  /** `p`: port. */
  port: number;
  /** `id`: desktop id. */
  desktopId: string;
  /** `n`: desktop display name. */
  desktopName: string;
  /** `t`: one-time pairing nonce, sent back as `PairRequest.nonce`. */
  nonce: string;
  /** `k`: 32-byte pairing secret, base64url without padding. Keep it secret. */
  secret: string;
}

function decodeComponent(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

/**
 * Parse a scanned QR payload. Returns `null` for anything that is not a
 * complete pairing link (a different QR, a truncated scan, a bad secret).
 * Hand-rolled rather than `URL`, whose React Native polyfill does not parse
 * custom schemes reliably.
 */
export function parsePairingLink(link: string): SyncPairingLink | null {
  if (!link.startsWith(SYNC_PAIR_LINK_PREFIX)) return null;
  const params = new Map<string, string>();
  for (const pair of link.slice(SYNC_PAIR_LINK_PREFIX.length).split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    const key = at === -1 ? pair : pair.slice(0, at);
    const value = at === -1 ? '' : pair.slice(at + 1);
    try {
      params.set(decodeComponent(key), decodeComponent(value));
    } catch {
      return null;
    }
  }
  const version = Number(params.get('v'));
  const port = Number(params.get('p'));
  const hosts = (params.get('h') ?? '').split(',').filter(host => host !== '');
  const desktopId = params.get('id') ?? '';
  const nonce = params.get('t') ?? '';
  const secret = params.get('k') ?? '';
  const valid =
    Number.isInteger(version) &&
    Number.isInteger(port) &&
    port > 0 &&
    port < 65536 &&
    hosts.length > 0 &&
    desktopId !== '' &&
    nonce !== '' &&
    BASE64URL_32_BYTES.test(secret);
  if (!valid) return null;
  return {
    version,
    hosts,
    port,
    desktopId,
    desktopName: params.get('n') ?? '',
    nonce,
    secret,
  };
}

/** The message whose HMAC under the QR secret is `PairRequest.proof`. */
export function pairProofMessage(nonce: string, deviceName: string, platform: string): string {
  return `${SYNC_PAIR_PROOF_CONTEXT}\n${nonce}\n${deviceName}\n${platform}`;
}

/**
 * The message whose HMAC under the QR secret is the device secret, once the
 * desktop has answered with `PairResponse.deviceId`.
 */
export function deviceSecretMessage(deviceId: string): string {
  return `${SYNC_DEVICE_SECRET_CONTEXT}\n${deviceId}`;
}

/** What a signed request covers. */
export interface SyncSigningInput {
  /** HTTP method, any case. */
  method: string;
  /** Path plus query exactly as sent, e.g. `/v1/sync/manifest?limit=500`. */
  pathAndQuery: string;
  /** Unix seconds. */
  ts: number;
  /** 16 to 64 characters of `[A-Za-z0-9_-]`, never reused. */
  nonce: string;
  /** Lowercase hex SHA-256 of the body (of the empty string for a GET). */
  bodySha256Hex: string;
}

/** Lowercase hex SHA-256 of the empty body, for GET and DELETE. */
export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** The exact string whose HMAC under the device secret is the signature. */
export function signingPayload(input: SyncSigningInput): string {
  return [
    SYNC_AUTH_SCHEME,
    input.method.toUpperCase(),
    input.pathAndQuery,
    String(input.ts),
    input.nonce,
    input.bodySha256Hex,
  ].join('\n');
}

/** The `Authorization` header value for a computed base64url signature. */
export function authorizationHeader(
  deviceId: string,
  ts: number,
  nonce: string,
  signatureBase64Url: string
): string {
  return `${SYNC_AUTH_SCHEME} dev=${deviceId},ts=${ts},n=${nonce},sig=${signatureBase64Url}`;
}
