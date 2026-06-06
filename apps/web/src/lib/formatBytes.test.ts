import { describe, it, expect } from 'vitest';
import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it('returns "0 B" for zero, negative, and non-finite input', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });

  it('shows whole bytes without a decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('handles fractional bytes without underflowing the unit index', () => {
    // 0 < bytes < 1 → negative log; exponent must clamp to 0, not -1 (which
    // would index UNITS out of bounds and render "undefined").
    const out = formatBytes(0.5);
    expect(out).not.toContain('undefined');
    expect(out).toBe('1 B');
  });

  it('uses decimal (1000-base) units, not binary', () => {
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1_000_000)).toBe('1 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
    expect(formatBytes(2_000_000_000_000)).toBe('2 TB');
  });

  it('strips a trailing .0 but keeps real fractions', () => {
    expect(formatBytes(2_000_000)).toBe('2 MB');
    expect(formatBytes(2_300_000)).toBe('2.3 MB');
  });

  it('caps at the largest known unit', () => {
    expect(formatBytes(5_000_000_000_000_000)).toContain('PB');
  });
});
