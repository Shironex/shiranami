import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/lib/showcase/determinism';
import {
  applySwells,
  biquad,
  foldSeam,
  normalizePeak,
  normalizeRms,
  peakOf,
  pinkNoise,
  rmsOf,
  softCeiling,
  whiteNoise,
} from './dsp';

const SR = 8000;

function sine(freq: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

/** Mean absolute sample-to-sample step: the "typical" discontinuity of a signal. */
function meanStep(x: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < x.length; i++) sum += Math.abs(x[i] - x[i - 1]);
  return sum / (x.length - 1);
}

describe('foldSeam', () => {
  it('returns exactly one loop', () => {
    const src = pinkNoise(seededRandom(1), 1200);
    expect(foldSeam(src, 1000)).toHaveLength(1000);
  });

  it('makes the wrap-around step as small as any other step', () => {
    // A low sine is smooth, so any seam would stand out against its tiny steps.
    const src = sine(3, 1000 + 400);
    const loop = foldSeam(src, 1000);
    const wrap = Math.abs(loop[0] - loop[loop.length - 1]);
    expect(wrap).toBeLessThan(meanStep(loop) * 3);
  });

  it('leaves a hard edge when the source is not folded (control)', () => {
    const src = sine(3, 1000);
    expect(Math.abs(src[0] - src[src.length - 1])).toBeGreaterThan(meanStep(src) * 3);
  });

  it('keeps the level of uncorrelated noise through the crossfade', () => {
    const src = whiteNoise(seededRandom(2), SR * 3);
    const loop = foldSeam(src, SR * 2);
    const seam = loop.subarray(0, SR);
    expect(rmsOf(seam) / rmsOf(src)).toBeGreaterThan(0.9);
    expect(rmsOf(seam) / rmsOf(src)).toBeLessThan(1.1);
  });

  it('refuses a source with no overhang', () => {
    expect(() => foldSeam(new Float32Array(10), 10)).toThrow();
  });
});

describe('biquad', () => {
  it('lowpass passes the bass and cuts the treble', () => {
    const low = biquad(sine(100, SR), 'lowpass', 500, 0.7, SR);
    const high = biquad(sine(3000, SR), 'lowpass', 500, 0.7, SR);
    expect(rmsOf(low.subarray(SR / 2))).toBeGreaterThan(0.6);
    expect(rmsOf(high.subarray(SR / 2))).toBeLessThan(0.05);
  });

  it('highpass does the opposite', () => {
    const low = biquad(sine(50, SR), 'highpass', 1000, 0.7, SR);
    const high = biquad(sine(3000, SR), 'highpass', 1000, 0.7, SR);
    expect(rmsOf(low.subarray(SR / 2))).toBeLessThan(0.05);
    expect(rmsOf(high.subarray(SR / 2))).toBeGreaterThan(0.6);
  });
});

describe('levels', () => {
  it('normalizeRms hits the target in dBFS', () => {
    const x = normalizeRms(whiteNoise(seededRandom(3), 4000), -20);
    expect(20 * Math.log10(rmsOf(x))).toBeCloseTo(-20, 5);
  });

  it('normalizePeak hits the target peak', () => {
    expect(peakOf(normalizePeak(whiteNoise(seededRandom(4), 400), 0.5))).toBeCloseTo(0.5, 6);
  });

  it('softCeiling leaves quiet samples alone and bounds loud ones', () => {
    const x = Float32Array.from([0.1, -0.3, 0.9, -5]);
    softCeiling(x, 0.4);
    expect(x[0]).toBeCloseTo(0.1);
    expect(x[1]).toBeCloseTo(-0.3);
    expect(x[2]).toBeGreaterThan(0.4);
    expect(x[2]).toBeLessThanOrEqual(0.5);
    expect(x[3]).toBeGreaterThanOrEqual(-0.5);
  });

  it('applySwells wraps cleanly (whole cycles per loop)', () => {
    const x = applySwells(new Float32Array(1000).fill(1), [{ cycles: 2, depth: 0.2, phase: 0.5 }]);
    expect(Math.abs(x[0] - x[999])).toBeLessThan(0.01);
  });
});

describe('determinism', () => {
  it('renders the same noise from the same seed', () => {
    expect(pinkNoise(seededRandom(9), 500)).toEqual(pinkNoise(seededRandom(9), 500));
    expect(pinkNoise(seededRandom(9), 500)).not.toEqual(pinkNoise(seededRandom(10), 500));
  });
});
