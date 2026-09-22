import { describe, expect, it } from 'vitest';
import type { WeatherCurrent } from '@shiranami/contracts';
import {
  COMPANION_OUTFITS,
  COMPANION_SCARF_BELOW_C,
  COMPANION_SWEAT_ABOVE_C,
  isCompanionNightHour,
  outfitFor,
  seasonalOutfitFor,
  type CompanionOutfit,
} from './companionOutfit';

function weather(overrides: Partial<WeatherCurrent> = {}): WeatherCurrent {
  return { tempC: 15, condition: 'clear', label: 'Clear sky', ...overrides };
}

/** A mild spring afternoon — no live-weather rule fires. */
const NOON = new Date(2026, 3, 15, 12, 0, 0);
const MIDNIGHT = new Date(2026, 3, 15, 0, 30, 0);

describe('outfitFor with live weather', () => {
  it.each<[Partial<WeatherCurrent>, CompanionOutfit | null]>([
    [{ condition: 'rain' }, 'umbrella'],
    [{ condition: 'thunderstorm' }, 'umbrella'],
    [{ condition: 'snow', tempC: -2 }, 'snow'],
    [{ condition: 'clear', tempC: COMPANION_SCARF_BELOW_C - 1 }, 'scarf'],
    [{ condition: 'clear', tempC: COMPANION_SWEAT_ABOVE_C + 4 }, 'sun'],
    [{ condition: 'fog' }, 'lantern'],
    [{ condition: 'clear', tempC: 18 }, null],
    [{ condition: 'partly_cloudy', tempC: 18 }, null],
    [{ condition: 'cloudy', tempC: 18 }, null],
    [{ condition: 'unknown', tempC: 18 }, null],
  ])('derives %o → %s at noon', (overrides, expected) => {
    expect(outfitFor(weather(overrides), NOON)).toBe(expected);
  });

  it('lights the lantern for clear night skies', () => {
    expect(outfitFor(weather({ condition: 'clear' }), MIDNIGHT)).toBe('lantern');
  });

  it('lets the rain umbrella win over cold, heat, and night', () => {
    expect(outfitFor(weather({ condition: 'rain', tempC: -4 }), MIDNIGHT)).toBe('umbrella');
    expect(outfitFor(weather({ condition: 'thunderstorm', tempC: 33 }), NOON)).toBe('umbrella');
  });

  it('prefers the scarf over the lantern on a cold foggy morning', () => {
    expect(outfitFor(weather({ condition: 'fog', tempC: 1 }), NOON)).toBe('scarf');
  });

  it('treats the thresholds as exclusive bounds', () => {
    expect(outfitFor(weather({ tempC: COMPANION_SCARF_BELOW_C }), NOON)).toBeNull();
    expect(outfitFor(weather({ tempC: COMPANION_SWEAT_ABOVE_C }), NOON)).toBeNull();
  });
});

describe('outfitFor without weather (seasonal fallback)', () => {
  it.each<[number, CompanionOutfit | null]>([
    [0, 'snow'],
    [1, 'snow'],
    [2, 'sakura'],
    [3, 'sakura'],
    [4, 'sakura'],
    [5, null],
    [6, null],
    [7, null],
    [8, 'maple'],
    [9, 'maple'],
    [10, 'maple'],
    [11, 'snow'],
  ])('month index %i → %s', (month, expected) => {
    const date = new Date(2026, month, 10, 12, 0, 0);
    expect(outfitFor(null, date)).toBe(expected);
    expect(seasonalOutfitFor(date)).toBe(expected);
  });
});

describe('isCompanionNightHour', () => {
  it.each<[number, boolean]>([
    [0, true],
    [4, true],
    [5, false],
    [12, false],
    [21, false],
    [22, true],
    [23, true],
  ])('hour %i → %s', (hour, expected) => {
    expect(isCompanionNightHour(hour)).toBe(expected);
  });
});

describe('COMPANION_OUTFITS', () => {
  it('lists every accessory exactly once', () => {
    expect(new Set(COMPANION_OUTFITS).size).toBe(COMPANION_OUTFITS.length);
    expect(COMPANION_OUTFITS).toHaveLength(7);
  });
});
