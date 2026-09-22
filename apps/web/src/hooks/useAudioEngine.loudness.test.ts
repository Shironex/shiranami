import { describe, expect, it } from 'vitest';
import { loudnessLinearGain } from './useAudioEngine';
import type { TrackLoudness } from '@/lib/loudness';
import { DEFAULT_LOUDNESS_TARGET_LUFS } from '@/stores/usePlaybackStore';

/**
 * Per-deck loudness leveling rides each deck's own gain (value × factor) so a
 * crossfade normalizes both tracks independently. These tests exercise the pure
 * factor helper (the unit `setVolume` multiplies in) the same way the engine
 * does at each deck-load point — since F5, with the full loudness surface and
 * the track/album mode.
 */
describe('loudnessLinearGain', () => {
  const target = DEFAULT_LOUDNESS_TARGET_LUFS; // -14

  const measured = (
    loudnessLufs: number | null,
    extra: Partial<TrackLoudness> = {}
  ): TrackLoudness => ({
    loudnessLufs,
    albumLoudnessLufs: null,
    truePeakDb: null,
    ...extra,
  });

  it('is a no-op (1) when leveling is disabled', () => {
    expect(loudnessLinearGain(measured(-20), false, 'track', target)).toBe(1);
  });

  it('is a no-op (1) when the track loudness is unmeasured', () => {
    expect(loudnessLinearGain(measured(null), true, 'track', target)).toBe(1);
    expect(loudnessLinearGain(null, true, 'track', target)).toBe(1);
  });

  it('boosts a quiet track (> 1) toward the target', () => {
    // -20 LUFS vs -14 target → +6 dB → ~1.995x
    const g = loudnessLinearGain(measured(-20), true, 'track', target);
    expect(g).toBeGreaterThan(1);
    expect(g).toBeCloseTo(10 ** (6 / 20), 5);
  });

  it('attenuates a loud track (< 1) toward the target', () => {
    // -8 LUFS vs -14 target → -6 dB → ~0.501x
    const g = loudnessLinearGain(measured(-8), true, 'track', target);
    expect(g).toBeLessThan(1);
    expect(g).toBeCloseTo(10 ** (-6 / 20), 5);
  });

  describe('album mode', () => {
    it('levels by the album measurement, not the track one', () => {
      // Quiet interlude (-22) on a louder record (-16): album mode nudges the
      // whole record to target (+2 dB) instead of flattening the interlude.
      const interlude = measured(-22, { albumLoudnessLufs: -16 });
      const g = loudnessLinearGain(interlude, true, 'album', target);
      expect(g).toBeCloseTo(10 ** (2 / 20), 5);
    });

    it('falls back to track gain when no album measurement exists', () => {
      const untagged = measured(-20);
      expect(loudnessLinearGain(untagged, true, 'album', target)).toBeCloseTo(10 ** (6 / 20), 5);
    });
  });

  describe('true-peak guard', () => {
    it('caps a boost so the peak stays under the ceiling', () => {
      // +6 dB wanted, but the master already peaks at -3 dBTP: only 2 dB of
      // headroom to the -1 dBTP ceiling.
      const hot = measured(-20, { truePeakDb: -3 });
      expect(loudnessLinearGain(hot, true, 'track', target)).toBeCloseTo(10 ** (2 / 20), 5);
    });

    it('never limits attenuation', () => {
      const loud = measured(-8, { truePeakDb: 0.5 });
      expect(loudnessLinearGain(loud, true, 'track', target)).toBeCloseTo(10 ** (-6 / 20), 5);
    });

    it('boosts unguarded when no peak was stored (v1-era rows)', () => {
      expect(loudnessLinearGain(measured(-20), true, 'track', target)).toBeCloseTo(
        10 ** (6 / 20),
        5
      );
    });
  });

  describe('crossfade: each deck keeps its own factor', () => {
    // Simulate the engine: deckLoudnessRef[deck] = factor(deck's track),
    // effective gain = userVol × factor.
    it('outgoing and incoming decks get independent factors', () => {
      const userVol = 0.8;
      const outgoing = measured(-8); // loud track on the outgoing deck → attenuated
      const incoming = measured(-22); // quiet track on the incoming deck → boosted

      const outFactor = loudnessLinearGain(outgoing, true, 'track', target);
      const inFactor = loudnessLinearGain(incoming, true, 'track', target);

      expect(outFactor).toBeLessThan(1);
      expect(inFactor).toBeGreaterThan(1);
      expect(outFactor).not.toBeCloseTo(inFactor, 3);

      // A deck's gain reflects ITS track's factor, not the other deck's.
      expect(userVol * outFactor).toBeCloseTo(userVol * 10 ** (-6 / 20), 5);
      expect(userVol * inFactor).toBeCloseTo(userVol * 10 ** (8 / 20), 5);
    });

    it('a disabled-loudness deck keeps raw volume while it crossfades', () => {
      const userVol = 0.8;
      // Leveling off → both decks factor 1 → raw user volume on each.
      expect(userVol * loudnessLinearGain(measured(-8), false, 'track', target)).toBe(userVol);
      expect(userVol * loudnessLinearGain(measured(-22), false, 'track', target)).toBe(userVol);
    });
  });
});
