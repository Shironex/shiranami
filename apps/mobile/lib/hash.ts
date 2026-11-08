/**
 * FNV-1a, 32 bit, with a final avalanche step (MurmurHash3 fmix32). Plain
 * FNV-1a spreads its low bits poorly on short strings, and pickers take the
 * hash modulo a small count, so similar names kept landing on the same tile.
 * Stable across runs, so a title always maps to the same tile.
 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
