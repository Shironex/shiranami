import { describe, it, expect } from 'vitest';
import { breathingPeriods, foldPeriodIntoBand } from './tempoBreathing';

describe('foldPeriodIntoBand', () => {
  it('leaves an in-band period untouched', () => {
    expect(foldPeriodIntoBand(3.5, 3, 6)).toBe(3.5);
  });

  it('doubles a too-fast period into the band', () => {
    expect(foldPeriodIntoBand(1.4, 3, 6)).toBeCloseTo(5.6);
  });

  it('halves a too-slow period into the band', () => {
    expect(foldPeriodIntoBand(8, 3, 6)).toBe(4);
  });

  it('treats the upper bound as exclusive', () => {
    expect(foldPeriodIntoBand(6, 3, 6)).toBe(3);
  });
});

describe('breathingPeriods', () => {
  it('returns null when no BPM is stored', () => {
    expect(breathingPeriods(null)).toBeNull();
    expect(breathingPeriods(undefined)).toBeNull();
  });

  it('returns null for implausible values', () => {
    expect(breathingPeriods(Number.NaN)).toBeNull();
    expect(breathingPeriods(Number.POSITIVE_INFINITY)).toBeNull();
    expect(breathingPeriods(0)).toBeNull();
    expect(breathingPeriods(12)).toBeNull();
    expect(breathingPeriods(900)).toBeNull();
  });

  it('breathes once a bar at a classic lofi tempo', () => {
    // 80 BPM: beat 0.75s, bar 3s — the bloom swells exactly once a bar.
    const periods = breathingPeriods(80);
    expect(periods).toEqual({ beat: 0.75, bloom: 3, float: 6, pulse: 3 });
  });

  it('folds a fast track to half or quarter time instead of strobing', () => {
    // 178 BPM: the bar is 1.35s — every surface folds it into its calm band.
    const periods = breathingPeriods(178);
    expect(periods?.bloom).toBeCloseTo(5.39, 2);
    expect(periods?.float).toBeCloseTo(5.39, 2);
    expect(periods?.pulse).toBeCloseTo(2.7, 2);
  });

  it('never produces a period faster than the calm floor at any tempo', () => {
    for (let bpm = 30; bpm <= 300; bpm += 1) {
      const periods = breathingPeriods(bpm);
      expect(periods).not.toBeNull();
      expect(periods!.bloom).toBeGreaterThanOrEqual(3);
      expect(periods!.float).toBeGreaterThanOrEqual(4.5);
      expect(periods!.pulse).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps every period inside its band ceiling', () => {
    for (let bpm = 30; bpm <= 300; bpm += 1) {
      const periods = breathingPeriods(bpm)!;
      expect(periods.bloom).toBeLessThan(6.01);
      expect(periods.float).toBeLessThan(9.01);
      expect(periods.pulse).toBeLessThan(4.01);
    }
  });
});
