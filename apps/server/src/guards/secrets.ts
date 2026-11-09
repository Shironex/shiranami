import { timingSafeEqual } from 'node:crypto';

/** Compares a given secret with the expected one without leaking where they differ. */
export function secretsEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
