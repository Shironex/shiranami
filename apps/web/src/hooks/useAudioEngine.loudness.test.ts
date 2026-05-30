import { describe, expect, it } from 'vitest';
import { loudnessLinearGain } from './useAudioEngine';
import { DEFAULT_LOUDNESS_TARGET_LUFS } from '@/stores/usePlaybackStore';

/**
 * Per-deck loudness leveling rides each deck's own gain (value × factor) so a
 * crossfade normalizes both tracks independently. These tests exercise the pure
 * factor helper (the unit `setVolume` multiplies in) the same way the engine
 * does at each deck-load point.
 */
describe('loudnessLinearGain', () => {
  const target = DEFAULT_LOUDNESS_TARGET_LUFS; // -14

  it('is a no-op (1) when leveling is disabled', () => {
    expect(loudnessLinearGain(-20, false, target)).toBe(1);
  });

  it('is a no-op (1) when the track loudness is unmeasured', () => {
    expect(loudnessLinearGain(null, true, target)).toBe(1);
    expect(loudnessLinearGain(undefined, true, target)).toBe(1);
  });

  it('boosts a quiet track (> 1) toward the target', () => {
    // -20 LUFS vs -14 target → +6 dB → ~1.995x
    const g = loudnessLinearGain(-20, true, target);
    expect(g).toBeGreaterThan(1);
    expect(g).toBeCloseTo(10 ** (6 / 20), 5);
  });

  it('attenuates a loud track (< 1) toward the target', () => {
    // -8 LUFS vs -14 target → -6 dB → ~0.501x
    const g = loudnessLinearGain(-8, true, target);
    expect(g).toBeLessThan(1);
    expect(g).toBeCloseTo(10 ** (-6 / 20), 5);
  });

  describe('crossfade: each deck keeps its own factor', () => {
    // Simulate the engine: deckLoudnessRef[deck] = factor(deck's track),
    // effective gain = userVol × factor.
    it('outgoing and incoming decks get independent factors', () => {
      const userVol = 0.8;
      const outgoingLufs = -8; // loud track on the outgoing deck → attenuated
      const incomingLufs = -22; // quiet track on the incoming deck → boosted

      const outFactor = loudnessLinearGain(outgoingLufs, true, target);
      const inFactor = loudnessLinearGain(incomingLufs, true, target);

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
      expect(userVol * loudnessLinearGain(-8, false, target)).toBe(userVol);
      expect(userVol * loudnessLinearGain(-22, false, target)).toBe(userVol);
    });
  });
});
