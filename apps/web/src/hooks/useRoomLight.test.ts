import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROOM_LIGHT_STOPS,
  gradeForStopKey,
  roomLightForHour,
  roomLightLayerStyle,
  roomLightStopKeyForHour,
  shiftOklchHue,
  useRoomLight,
  type RoomLightStopKey,
} from './useRoomLight';
import { ROOM_LIGHT_STOP_SETTINGS } from '@/stores/useUIStore';

function gradeOf(key: RoomLightStopKey) {
  return ROOM_LIGHT_STOPS.find(stop => stop.key === key)!.grade;
}

describe('roomLightForHour', () => {
  it.each<[number, RoomLightStopKey]>([
    [0, 'night'],
    [1, 'night'],
    [2, 'night'],
    [3, 'night'],
    [4, 'night'],
    [5, 'dawn'],
    [6, 'dawn'],
    [7, 'dawn'],
    [8, 'dawn'],
    [9, 'day'],
    [10, 'day'],
    [11, 'day'],
    [12, 'day'],
    [13, 'day'],
    [14, 'day'],
    [15, 'day'],
    [16, 'day'],
    [17, 'goldenHour'],
    [18, 'goldenHour'],
    [19, 'goldenHour'],
    [20, 'dusk'],
    [21, 'dusk'],
    [22, 'night'],
    [23, 'night'],
  ])('hour %i resolves to the %s stop', (hour, key) => {
    expect(roomLightForHour(hour)).toEqual(gradeOf(key));
  });

  it('floors fractional hours and wraps out-of-range values modulo 24', () => {
    expect(roomLightForHour(17.9)).toEqual(gradeOf('goldenHour'));
    expect(roomLightForHour(24)).toEqual(gradeOf('night'));
    expect(roomLightForHour(29)).toEqual(gradeOf('dawn'));
    expect(roomLightForHour(-1)).toEqual(gradeOf('night'));
  });

  it('keeps every stop a subtle grade: alphas bounded and ordered hours', () => {
    let previousFrom = -1;
    for (const stop of ROOM_LIGHT_STOPS) {
      expect(stop.fromHour).toBeGreaterThan(previousFrom);
      previousFrom = stop.fromHour;
      expect(stop.grade.warmth).toBeGreaterThanOrEqual(0);
      expect(stop.grade.warmth).toBeLessThanOrEqual(0.3);
      expect(stop.grade.lampVignette).toBeGreaterThanOrEqual(0);
      expect(stop.grade.lampVignette).toBeLessThanOrEqual(1);
    }
  });

  it('lights the desk lamp only after dark', () => {
    for (const stop of ROOM_LIGHT_STOPS) {
      const lampExpected = stop.key === 'dusk' || stop.key === 'night';
      expect(stop.grade.lampVignette > 0).toBe(lampExpected);
    }
  });
});

describe('the stop-setting union in useUIStore', () => {
  it('is auto plus exactly the stop keys, in stop order', () => {
    // The store cannot import this hook module (stores never depend on hooks),
    // so its hand-written union is pinned here against the one source of truth.
    expect(ROOM_LIGHT_STOP_SETTINGS).toEqual(['auto', ...ROOM_LIGHT_STOPS.map(stop => stop.key)]);
  });
});

describe('shiftOklchHue', () => {
  it('rotates the hue and wraps modulo 360', () => {
    expect(shiftOklchHue('oklch(0.75 0.14 65)', 30)).toBe('oklch(0.75 0.14 95)');
    expect(shiftOklchHue('oklch(0.75 0.14 350)', 30)).toBe('oklch(0.75 0.14 20)');
    expect(shiftOklchHue('oklch(0.75 0.14 10)', -30)).toBe('oklch(0.75 0.14 340)');
  });

  it('returns unrecognised colors and zero shifts unchanged', () => {
    expect(shiftOklchHue('rebeccapurple', 30)).toBe('rebeccapurple');
    expect(shiftOklchHue('oklch(0.75 0.14 65)', 0)).toBe('oklch(0.75 0.14 65)');
  });
});

describe('roomLightLayerStyle', () => {
  it('pre-mixes the tint to its warmth and exposes the lamp opacity', () => {
    const style = roomLightLayerStyle(gradeOf('goldenHour')) as Record<string, string>;

    expect(style['--room-light-tint']).toBe(
      'color-mix(in oklab, oklch(0.75 0.14 65) 10%, transparent)'
    );
    expect(style['--room-light-lamp']).toBe('0');
    expect(style['--room-light-lamp-hue']).toBe('0');
  });

  it('scales warmth and lamp with intensity, clamped at fully opaque', () => {
    const half = roomLightLayerStyle(gradeOf('night'), {
      intensity: 50,
      hueShift: 0,
    }) as Record<string, string>;
    // night: warmth 0.22 -> 11%, lamp 1 -> 0.5
    expect(half['--room-light-tint']).toContain(' 11%, transparent)');
    expect(half['--room-light-lamp']).toBe('0.5');

    const boosted = roomLightLayerStyle(gradeOf('night'), {
      intensity: 150,
      hueShift: 0,
    }) as Record<string, string>;
    // night's lamp is already 1; 150% must not push it past opaque.
    expect(boosted['--room-light-tint']).toContain(' 33%, transparent)');
    expect(boosted['--room-light-lamp']).toBe('1');
  });

  it('rotates the tint hue and publishes the lamp nudge', () => {
    const style = roomLightLayerStyle(gradeOf('goldenHour'), {
      intensity: 100,
      hueShift: -20,
    }) as Record<string, string>;

    expect(style['--room-light-tint']).toBe(
      'color-mix(in oklab, oklch(0.75 0.14 45) 10%, transparent)'
    );
    expect(style['--room-light-lamp-hue']).toBe('-20');
  });
});

describe('useRoomLight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the grade for the current local hour', () => {
    vi.setSystemTime(new Date(2026, 7, 14, 18, 30, 0));

    const { result } = renderHook(() => useRoomLight());

    expect(result.current).toEqual(gradeOf('goldenHour'));
  });

  it('holds the named stop regardless of the clock', () => {
    vi.setSystemTime(new Date(2026, 7, 14, 12, 0, 0));

    const { result } = renderHook(() => useRoomLight('night'));

    expect(result.current).toEqual(gradeOf('night'));
  });
});

describe('roomLightStopKeyForHour / gradeForStopKey', () => {
  it('agree with roomLightForHour at every hour', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(gradeForStopKey(roomLightStopKeyForHour(hour))).toEqual(roomLightForHour(hour));
    }
  });
});
