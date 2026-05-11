import { describe, it, expect } from 'vitest';
import { confidenceLevel } from './enrichConfidence';

describe('confidenceLevel', () => {
  it('maps >= 0.8 to high', () => {
    expect(confidenceLevel(0.8)).toBe('high');
    expect(confidenceLevel(0.95)).toBe('high');
    expect(confidenceLevel(1)).toBe('high');
  });

  it('maps 0.5 .. 0.8 to med', () => {
    expect(confidenceLevel(0.5)).toBe('med');
    expect(confidenceLevel(0.65)).toBe('med');
    expect(confidenceLevel(0.79)).toBe('med');
  });

  it('maps < 0.5 to low', () => {
    expect(confidenceLevel(0.49)).toBe('low');
    expect(confidenceLevel(0.3)).toBe('low');
    expect(confidenceLevel(0)).toBe('low');
  });

  it('returns null for an absent / NaN score', () => {
    expect(confidenceLevel(undefined)).toBeNull();
    expect(confidenceLevel(null)).toBeNull();
    expect(confidenceLevel(Number.NaN)).toBeNull();
  });
});
