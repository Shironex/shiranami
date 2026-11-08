import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_BODY_SHA256,
  SYNC_PAIR_LINK_PREFIX,
  SYNC_ROUTES,
  authorizationHeader,
  deviceSecretMessage,
  fromBase64Url,
  generatePairingKeyPair,
  pairProofMessage,
  pairResponseMessage,
  pairingPublicKey,
  pairingSharedSecret,
  parsePairingLink,
  signingPayload,
  toBase64Url,
  verifyPairResponse,
} from './index';

// The same literals are asserted by crates/shiranami-sync/tests/contract_vectors.rs,
// so the phone and the desktop cannot drift apart byte by byte.
const SECRET = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
// RFC 7748 section 6.1: Alice plays the phone, Bob the desktop.
const PHONE_PRIVATE = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const DESKTOP_PRIVATE = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const PHONE_PUBLIC = 'hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo';
const DESKTOP_PUBLIC = '3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08';
const SHARED = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
const PROOF = 'viAAzEqSCV0va7LtCeoa647zZcs-C0cc5pbIDSF4fSs';
const KEY_PROOF = 'VdwbK1YiGfGj8J9oGYM1h15ys2YBY4qNODzpvlb6Nno';
const DEVICE_SECRET = 'R_T6TkxtTqk6KHHqxANdfbYs5MLiuZIJZvjiCB_Y8ew';
const SIGNATURE = 'qNUAzd9-_dlTBPKaWs2NP3q9LXVmauiBLGeZGzOSGkY';
const LINK = `${SYNC_PAIR_LINK_PREFIX}v=2&h=192.168.1.20%2C10.0.0.5&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k=${SECRET}`;

function hmac(key: string | Uint8Array, message: string): string {
  const raw = typeof key === 'string' ? Buffer.from(key, 'base64url') : Buffer.from(key);
  return createHmac('sha256', raw).update(message).digest('base64url');
}

const hex = (text: string) => Uint8Array.from(Buffer.from(text, 'hex'));

describe('parsePairingLink', () => {
  it('reads every field of a desktop link', () => {
    expect(parsePairingLink(LINK)).toEqual({
      version: 2,
      hosts: ['192.168.1.20', '10.0.0.5'],
      port: 53111,
      desktopId: 'desk-1',
      desktopName: 'Studio PC',
      nonce: 'nonce-0001',
      secret: SECRET,
    });
  });

  it.each([
    ['another scheme', LINK.replace('shiranami://', 'https://')],
    ['no secret', LINK.replace(`&k=${SECRET}`, '')],
    ['a short secret', LINK.replace(SECRET, SECRET.slice(1))],
    ['no hosts', LINK.replace('h=192.168.1.20%2C10.0.0.5', 'h=')],
    ['a bad port', LINK.replace('p=53111', 'p=70000')],
    ['broken escaping', LINK.replace('n=Studio+PC', 'n=%E0%A4%A')],
  ])('rejects a link with %s', (_label, link) => {
    expect(parsePairingLink(link)).toBeNull();
  });
});

describe('signing', () => {
  it('runs the X25519 exchange of RFC 7748 and the shared vector', () => {
    expect(pairingPublicKey(hex(PHONE_PRIVATE))).toBe(PHONE_PUBLIC);
    expect(pairingPublicKey(hex(DESKTOP_PRIVATE))).toBe(DESKTOP_PUBLIC);
    expect(
      Buffer.from(pairingSharedSecret(hex(PHONE_PRIVATE), DESKTOP_PUBLIC)).toString('hex')
    ).toBe(SHARED);
    expect(
      Buffer.from(pairingSharedSecret(hex(DESKTOP_PRIVATE), PHONE_PUBLIC)).toString('hex')
    ).toBe(SHARED);
  });

  it('matches the shared pairing proof and device secret', () => {
    expect(hmac(SECRET, pairProofMessage('nonce-0001', 'Pixel 9', 'android', PHONE_PUBLIC))).toBe(
      PROOF
    );
    const shared = pairingSharedSecret(hex(PHONE_PRIVATE), DESKTOP_PUBLIC);
    expect(
      hmac(shared, deviceSecretMessage('dev-0001', SECRET, PHONE_PUBLIC, DESKTOP_PUBLIC))
    ).toBe(DEVICE_SECRET);
  });

  it('matches the shared desktop key proof and verifies it', () => {
    expect(hmac(SECRET, pairResponseMessage('dev-0001', PHONE_PUBLIC, DESKTOP_PUBLIC))).toBe(
      KEY_PROOF
    );
    const response = { deviceId: 'dev-0001', publicKey: DESKTOP_PUBLIC, keyProof: KEY_PROOF };
    expect(verifyPairResponse(SECRET, PHONE_PUBLIC, response)).toBe(true);
    // A key swapped in on the way back, or a proof made for another phone key.
    expect(verifyPairResponse(SECRET, PHONE_PUBLIC, { ...response, publicKey: PHONE_PUBLIC })).toBe(
      false
    );
    expect(verifyPairResponse(SECRET, DESKTOP_PUBLIC, response)).toBe(false);
    expect(verifyPairResponse(SECRET, PHONE_PUBLIC, { ...response, keyProof: 'short' })).toBe(
      false
    );
  });

  it('refuses a low-order or malformed desktop key', () => {
    const { secretKey } = generatePairingKeyPair();
    expect(() => pairingSharedSecret(secretKey, toBase64Url(new Uint8Array(32)))).toThrow();
    expect(() => pairingSharedSecret(secretKey, 'c2hvcnQ')).toThrow();
  });

  it('round-trips base64url without Buffer', () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff);
      const text = toBase64Url(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64url'));
      expect(fromBase64Url(text)).toEqual(bytes);
    }
    expect(fromBase64Url('a+b/')).toBeNull();
  });

  it('matches the shared request signature and header', () => {
    expect(createHash('sha256').update('').digest('hex')).toBe(EMPTY_BODY_SHA256);
    const payload = signingPayload({
      method: 'get',
      pathAndQuery: `${SYNC_ROUTES.manifest}?limit=2`,
      ts: 1762600000,
      nonce: 'abcdefghijklmnop',
      bodySha256Hex: EMPTY_BODY_SHA256,
    });
    expect(payload.split('\n')[1]).toBe('GET');
    const signature = hmac(DEVICE_SECRET, payload);
    expect(signature).toBe(SIGNATURE);
    expect(authorizationHeader('dev-0001', 1762600000, 'abcdefghijklmnop', signature)).toBe(
      `SNM1 dev=dev-0001,ts=1762600000,n=abcdefghijklmnop,sig=${SIGNATURE}`
    );
  });

  it('escapes path segments in the parameterised routes', () => {
    expect(SYNC_ROUTES.audio('a/b')).toBe('/v1/sync/tracks/a%2Fb/audio');
  });
});
