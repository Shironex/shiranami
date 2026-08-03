import { describe, expect, it } from 'vitest';
import { computeLevelingGainDb, computeLoudnessGainDb, type TrackLoudness } from './loudness';

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

describe('computeLevelingGainDb', () => {
  const track = (
    loudnessLufs: number | null,
    extra: Partial<TrackLoudness> = {}
  ): TrackLoudness => ({
    loudnessLufs,
    albumLoudnessLufs: null,
    truePeakDb: null,
    ...extra,
  });

  it('equals the plain track gain in track mode', () => {
    expect(computeLevelingGainDb(track(-18), 'track', -14)).toBeCloseTo(4);
    expect(computeLevelingGainDb(null, 'track', -14)).toBe(0);
  });

  it('uses the album measurement in album mode', () => {
    // The quiet interlude (-22) on a -16 record moves with its record (+2 dB),
    // not to its own flattened +8.
    expect(computeLevelingGainDb(track(-22, { albumLoudnessLufs: -16 }), 'album', -14)).toBeCloseTo(
      2
    );
  });

  it('falls back per-track in album mode when no album value exists', () => {
    expect(computeLevelingGainDb(track(-18), 'album', -14)).toBeCloseTo(4);
  });

  it('caps boosts at the true-peak ceiling', () => {
    // Wants +4 dB, but the master peaks at -2 dBTP → only 1 dB of headroom
    // to the -1 dBTP ceiling.
    expect(computeLevelingGainDb(track(-18, { truePeakDb: -2 }), 'track', -14)).toBeCloseTo(1);
    // Already at the ceiling: no boost at all, rather than a cut.
    expect(computeLevelingGainDb(track(-18, { truePeakDb: -0.5 }), 'track', -14)).toBe(0);
  });

  it('never limits attenuation, even on clipping masters', () => {
    expect(computeLevelingGainDb(track(-10, { truePeakDb: 0.8 }), 'track', -14)).toBeCloseTo(-4);
  });
});
