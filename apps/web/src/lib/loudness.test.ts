import { describe, expect, it } from 'vitest';
import { computeLoudnessGainDb } from './loudness';

describe('computeLoudnessGainDb', () => {
  it('returns target − measured for a normal track', () => {
    // A track measured quieter than target gets a positive boost.
    expect(computeLoudnessGainDb(-18, -14)).toBeCloseTo(4);
    // A track louder than target gets attenuated.
    expect(computeLoudnessGainDb(-10, -14)).toBeCloseTo(-4);
  });

  it('returns 0 for an unanalysed track (null/undefined)', () => {
    expect(computeLoudnessGainDb(null, -14)).toBe(0);
    expect(computeLoudnessGainDb(undefined, -14)).toBe(0);
  });

  it('returns 0 for non-finite measurements (silent track)', () => {
    expect(computeLoudnessGainDb(-Infinity, -14)).toBe(0);
    expect(computeLoudnessGainDb(NaN, -14)).toBe(0);
  });

  it('clamps extreme boosts to ±12 dB', () => {
    expect(computeLoudnessGainDb(-40, -14)).toBe(12);
    expect(computeLoudnessGainDb(10, -14)).toBe(-12);
  });
});
