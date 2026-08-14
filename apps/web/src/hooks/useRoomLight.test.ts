import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROOM_LIGHT_STOPS,
  roomLightForHour,
  roomLightLayerStyle,
  useRoomLight,
  type RoomLightStopKey,
} from './useRoomLight';

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

describe('roomLightLayerStyle', () => {
  it('pre-mixes the tint to its warmth and exposes the lamp opacity', () => {
    const style = roomLightLayerStyle(gradeOf('goldenHour')) as Record<string, string>;

    expect(style['--room-light-tint']).toBe(
      'color-mix(in oklab, oklch(0.75 0.14 65) 10%, transparent)'
    );
    expect(style['--room-light-lamp']).toBe('0');
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
});
