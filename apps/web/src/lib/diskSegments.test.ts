import { describe, it, expect } from 'vitest';
import { computeDiskSegments } from './diskSegments';

describe('computeDiskSegments', () => {
  it('splits a normal disk into music / other / free', () => {
    const { music, other, free } = computeDiskSegments(100, 1000, 400);
    expect(music).toBe(100);
    expect(free).toBe(400);
    expect(other).toBe(500);
    expect(music + other + free).toBe(1000);
  });

  it('clamps music to the space left after free (logical > allocated skew)', () => {
    // musicBytes (logical) can exceed allocated bytes under compression/sparse.
    const { music, other, free } = computeDiskSegments(900, 1000, 400);
    expect(free).toBe(400);
    expect(music).toBe(600); // clamped to total - free, never overflows
    expect(other).toBe(0);
    expect(music + other + free).toBe(1000);
  });

  it('never produces a negative segment', () => {
    const segments = computeDiskSegments(-50, 1000, -10);
    expect(segments.music).toBeGreaterThanOrEqual(0);
    expect(segments.other).toBeGreaterThanOrEqual(0);
    expect(segments.free).toBeGreaterThanOrEqual(0);
  });

  it('clamps free that exceeds total', () => {
    const { music, other, free } = computeDiskSegments(100, 1000, 1200);
    expect(free).toBe(1000);
    expect(music).toBe(0);
    expect(other).toBe(0);
  });

  it('returns all-zero for an unavailable (zero-capacity) volume', () => {
    expect(computeDiskSegments(0, 0, 0)).toEqual({ music: 0, other: 0, free: 0 });
  });

  it('always sums to total across a range of inputs', () => {
    const cases: Array<[number, number, number]> = [
      [250, 1000, 500],
      [0, 1000, 1000],
      [1000, 1000, 0],
      [333, 999, 333],
    ];
    for (const [musicBytes, total, freeBytes] of cases) {
      const { music, other, free } = computeDiskSegments(musicBytes, total, freeBytes);
      expect(music + other + free).toBe(total);
    }
  });
});
