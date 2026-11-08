import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_BODY_SHA256,
  SYNC_PAIR_LINK_PREFIX,
  SYNC_ROUTES,
  authorizationHeader,
  deviceSecretMessage,
  pairProofMessage,
  parsePairingLink,
  signingPayload,
} from './index';

// The same literals are asserted by crates/shiranami-sync/tests/contract_vectors.rs,
// so the phone and the desktop cannot drift apart byte by byte.
const SECRET = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const PROOF = 'YGweIeHph8FKkVl3njhjfgAINSbd4a1_mfrbCF9Eg40';
const DEVICE_SECRET = 'VbAJ1PZrcWHv9GgjkV1Vzy7JyIIYgl0BkhelhusLBNs';
const SIGNATURE = 'DfqZEExPhEqSto3riLwed5Rxm5tSUJ5vpusk3uR5oVc';
const LINK = `${SYNC_PAIR_LINK_PREFIX}v=1&h=192.168.1.20%2C10.0.0.5&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k=${SECRET}`;

function hmac(keyBase64Url: string, message: string): string {
  return createHmac('sha256', Buffer.from(keyBase64Url, 'base64url'))
    .update(message)
    .digest('base64url');
}

describe('parsePairingLink', () => {
  it('reads every field of a desktop link', () => {
    expect(parsePairingLink(LINK)).toEqual({
      version: 1,
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
  it('matches the shared pairing proof and device secret', () => {
    expect(hmac(SECRET, pairProofMessage('nonce-0001', 'Pixel 9', 'android'))).toBe(PROOF);
    expect(hmac(SECRET, deviceSecretMessage('dev-0001'))).toBe(DEVICE_SECRET);
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
