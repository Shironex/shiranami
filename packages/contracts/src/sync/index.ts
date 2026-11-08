// `@shiranami/contracts/sync`: the LAN sync v0 contract for the phone client.
//
// Tauri-free on purpose: the root `@shiranami/contracts` entry is fine for the
// desktop renderer, but the generated Tauri bindings import `@tauri-apps/api`,
// which a React Native bundle cannot load. This subpath only re-exports the
// generated wire types (from `crates/shiranami-sync/src/wire.rs`) plus
// helpers: parsing the QR link, the X25519 pairing exchange (`@noble/curves`,
// pure JS, so it runs under Hermes without a native module), the exact
// strings the desktop HMACs, and the HMACs themselves (`@noble/hashes`), so a
// client never re-implements any of it.
//
// Protocol reference: crates/shiranami-sync/README.md. The constants below are
// mirrored from the Rust crate and pinned by a test there.

import { x25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type * from '../generated/sync';

/**
 * The protocol version: `v=` in the QR link and `protocolVersion` in the pair
 * and hello bodies. 2 added the X25519 exchange; the route paths keep `/v1/`.
 */
export const SYNC_PROTOCOL_VERSION = 2;

/** The `Authorization` scheme and the first line of every signed payload. */
export const SYNC_AUTH_SCHEME = 'SNM1';

/** How far a request `ts` may be from the desktop clock, in seconds. */
export const SYNC_MAX_SKEW_SECONDS = 120;

/** Domain separator of the pairing proof. */
export const SYNC_PAIR_PROOF_CONTEXT = 'shiranami-sync/v2/pair';

/** Domain separator for the desktop's proof over its pairing response. */
export const SYNC_PAIR_RESPONSE_CONTEXT = 'shiranami-sync/v2/pair-response';

/** Domain separator of the device secret derivation. */
export const SYNC_DEVICE_SECRET_CONTEXT = 'shiranami-sync/v2/device-secret';

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

/**
 * The message whose HMAC under the QR secret is `PairRequest.proof`. Covers
 * the phone's public key, so a sniffer cannot swap in its own.
 */
export function pairProofMessage(
  nonce: string,
  deviceName: string,
  platform: string,
  phonePublicKey: string
): string {
  return `${SYNC_PAIR_PROOF_CONTEXT}\n${nonce}\n${deviceName}\n${platform}\n${phonePublicKey}`;
}

/**
 * The message whose HMAC under the QR secret is `PairResponse.keyProof`:
 * the device id the desktop minted and both public keys.
 */
export function pairResponseMessage(
  deviceId: string,
  phonePublicKey: string,
  desktopPublicKey: string
): string {
  return `${SYNC_PAIR_RESPONSE_CONTEXT}\n${deviceId}\n${phonePublicKey}\n${desktopPublicKey}`;
}

/**
 * Check `PairResponse.keyProof` before deriving the device secret. Only the
 * desktop that showed the QR knows its secret, so a desktop key swapped in on
 * the way back fails here. `pairingSecret` is the `k=` text of the link.
 * Refuse the pairing when this returns `false`.
 */
export function verifyPairResponse(
  pairingSecret: string,
  phonePublicKey: string,
  response: { deviceId: string; publicKey: string; keyProof: string }
): boolean {
  const key = fromBase64Url(pairingSecret);
  const proof = fromBase64Url(response.keyProof);
  if (!key || proof?.length !== 32) return false;
  const message = new TextEncoder().encode(
    pairResponseMessage(response.deviceId, phonePublicKey, response.publicKey)
  );
  const expected = hmac(sha256, key, message);
  // Constant time over the fixed 32 bytes.
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= (expected[i] ?? 0) ^ (proof[i] ?? 0);
  return difference === 0;
}

/**
 * The message whose HMAC is the device secret. The HMAC **key** is the X25519
 * shared secret ({@link pairingSharedSecret}), not the QR secret: knowing the
 * QR and sniffing the exchange is not enough to derive it.
 *
 * `pairingSecret` is the `k=` text of the link; the keys are base64url text.
 */
export function deviceSecretMessage(
  deviceId: string,
  pairingSecret: string,
  phonePublicKey: string,
  desktopPublicKey: string
): string {
  return `${SYNC_DEVICE_SECRET_CONTEXT}\n${deviceId}\n${pairingSecret}\n${phonePublicKey}\n${desktopPublicKey}`;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url without padding. No `Buffer`, no `btoa`: Hermes has neither reliably. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const chunk = (a << 16) | (b << 8) | c;
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) {
      out += B64URL[(chunk >> (18 - 6 * j)) & 63];
    }
  }
  return out;
}

/** Decode base64url without padding; `null` on any character outside the alphabet. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = B64URL.indexOf(char);
    if (value === -1) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** An ephemeral X25519 key pair for one pairing attempt. */
export interface SyncPairingKeyPair {
  /** Keep in memory only; drop it once the device secret is derived. */
  secretKey: Uint8Array;
  /** Base64url, sent as `PairRequest.publicKey`. */
  publicKey: string;
}

/** A fresh ephemeral key pair (from `crypto.getRandomValues`). */
export function generatePairingKeyPair(): SyncPairingKeyPair {
  const secretKey = x25519.utils.randomSecretKey();
  return { secretKey, publicKey: toBase64Url(x25519.getPublicKey(secretKey)) };
}

/** The public key of a given secret key, base64url. For tests and vectors. */
export function pairingPublicKey(secretKey: Uint8Array): string {
  return toBase64Url(x25519.getPublicKey(secretKey));
}

/**
 * The X25519 shared secret with the desktop's `PairResponse.publicKey`: the
 * HMAC key of the device secret. Throws on a malformed or low-order key.
 */
export function pairingSharedSecret(secretKey: Uint8Array, desktopPublicKey: string): Uint8Array {
  const peer = fromBase64Url(desktopPublicKey);
  if (peer?.length !== 32) throw new Error('the desktop public key is not 32 bytes');
  return x25519.getSharedSecret(secretKey, peer);
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

const utf8 = (text: string) => new TextEncoder().encode(text);

function hmacBase64Url(key: Uint8Array, message: string): string {
  return toBase64Url(hmac(sha256, key, utf8(message)));
}

function decodeKey(text: string, what: string): Uint8Array {
  const key = fromBase64Url(text);
  if (!key || key.length === 0) throw new Error(`${what} is not base64url`);
  return key;
}

/** `PairRequest.proof`: the HMAC of {@link pairProofMessage} under the `k=` secret. */
export function pairRequestProof(
  pairingSecret: string,
  nonce: string,
  deviceName: string,
  platform: string,
  phonePublicKey: string
): string {
  return hmacBase64Url(
    decodeKey(pairingSecret, 'the pairing secret'),
    pairProofMessage(nonce, deviceName, platform, phonePublicKey)
  );
}

/**
 * The device secret, base64url: the HMAC of {@link deviceSecretMessage} keyed
 * by the X25519 shared secret of the phone's ephemeral `secretKey` and the
 * desktop's public key. Call it only after {@link verifyPairResponse} passed.
 * Throws on a malformed or low-order desktop key.
 */
export function deriveDeviceSecret(input: {
  secretKey: Uint8Array;
  phonePublicKey: string;
  desktopPublicKey: string;
  deviceId: string;
  pairingSecret: string;
}): string {
  const shared = pairingSharedSecret(input.secretKey, input.desktopPublicKey);
  return hmacBase64Url(
    shared,
    deviceSecretMessage(
      input.deviceId,
      input.pairingSecret,
      input.phonePublicKey,
      input.desktopPublicKey
    )
  );
}

/** Lowercase hex SHA-256, for {@link SyncSigningInput.bodySha256Hex}. */
export function sha256Hex(body: Uint8Array | string): string {
  const digest = sha256(typeof body === 'string' ? utf8(body) : body);
  let out = '';
  for (const byte of digest) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** A fresh request nonce: 16 random bytes, base64url (22 characters). */
export function randomRequestNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * The `Authorization` header of a signed request. `deviceSecret` is the
 * base64url text {@link deriveDeviceSecret} returned.
 */
export function signRequest(
  deviceSecret: string,
  deviceId: string,
  input: SyncSigningInput
): string {
  const signature = hmacBase64Url(
    decodeKey(deviceSecret, 'the device secret'),
    signingPayload(input)
  );
  return authorizationHeader(deviceId, input.ts, input.nonce, signature);
}
