import { describe, it, expect } from 'vitest';
import { clamp, clamp01, formatDuration, mapWithConcurrency, truncate } from './utils';

describe('clamp', () => {
  it('passes finite values through within range and clamps the bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('collapses non-finite values to min instead of propagating', () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(clamp(Infinity, 0, 10)).toBe(0);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
    expect(clamp(NaN, 2, 8)).toBe(2);
  });
});

describe('clamp01', () => {
  it('clamps into [0, 1] and treats malformed input as 0', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });
});

describe('truncate', () => {
  it('returns empty string when max <= 0', () => {
    expect(truncate('hello', 0)).toBe('');
    expect(truncate('hello', -1)).toBe('');
  });

  it('returns original text when within max', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('truncates with ellipsis', () => {
    expect(truncate('abcdef', 5)).toBe('ab...');
  });

  it('respects short max vs ellipsis length', () => {
    expect(truncate('abcdef', 2, '...')).toBe('..');
  });
});

describe('formatDuration', () => {
  it('formats mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats hh:mm:ss when hours present', () => {
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('handles non-finite and negative', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(-1)).toBe('0:00');
  });
});

describe('mapWithConcurrency', () => {
  it('returns an empty array for empty input', async () => {
    const fn = async (x: number) => x;
    expect(await mapWithConcurrency([], 4, fn)).toEqual([]);
  });

  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 0, 20, 5, 10];
    const result = await mapWithConcurrency(delays, 2, async (ms, i) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return i;
    });
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('applies fn to every item with its index', async () => {
    const result = await mapWithConcurrency(['a', 'b', 'c'], 5, async (item, i) => `${item}${i}`);
    expect(result).toEqual(['a0', 'b1', 'c2']);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async i => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 1));
        inFlight -= 1;
        return i;
      }
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('treats limit <= 0 as serial (pool of 1)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3], 0, async i => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight -= 1;
      return i;
    });
    expect(maxInFlight).toBe(1);
  });

  it('propagates the first rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async i => {
        if (i === 2) throw new Error('boom');
        return i;
      })
    ).rejects.toThrow('boom');
  });
});
