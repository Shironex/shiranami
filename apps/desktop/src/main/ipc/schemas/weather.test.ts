import { describe, it, expect } from 'vitest';
import { weatherGeocodeArgs, weatherGetCurrentArgs } from './weather';

describe('weather payload schemas', () => {
  describe('weatherGeocodeArgs', () => {
    it('accepts a non-empty query', () => {
      expect(weatherGeocodeArgs.safeParse(['Tokyo']).success).toBe(true);
    });

    it('rejects an empty query', () => {
      expect(weatherGeocodeArgs.safeParse(['']).success).toBe(false);
    });

    it('rejects a missing query', () => {
      expect(weatherGeocodeArgs.safeParse([]).success).toBe(false);
    });
  });

  describe('weatherGetCurrentArgs', () => {
    it('accepts in-range coordinates', () => {
      expect(weatherGetCurrentArgs.safeParse([{ lat: 35.68, lon: 139.69 }]).success).toBe(true);
      expect(weatherGetCurrentArgs.safeParse([{ lat: -90, lon: 180 }]).success).toBe(true);
    });

    it('rejects out-of-range latitude/longitude', () => {
      expect(weatherGetCurrentArgs.safeParse([{ lat: 91, lon: 0 }]).success).toBe(false);
      expect(weatherGetCurrentArgs.safeParse([{ lat: 0, lon: 181 }]).success).toBe(false);
    });

    it('rejects missing coordinates', () => {
      expect(weatherGetCurrentArgs.safeParse([{ lat: 10 }]).success).toBe(false);
    });
  });
});
