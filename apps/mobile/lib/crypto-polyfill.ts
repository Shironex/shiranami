import { getRandomValues } from 'expo-crypto';

// Hermes has no Web Crypto. The LAN sync pairing (X25519 keys from
// @noble/curves) and its request nonces read `crypto.getRandomValues`, so the
// platform's secure random source is installed there once, before any of it
// runs. Imported first by app/_layout.tsx.
const scope = globalThis as { crypto?: Partial<Crypto> };
if (typeof scope.crypto?.getRandomValues !== 'function') {
  scope.crypto = {
    ...scope.crypto,
    getRandomValues: getRandomValues as Crypto['getRandomValues'],
  };
}
