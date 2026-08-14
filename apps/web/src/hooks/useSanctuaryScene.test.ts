import { describe, expect, it } from 'vitest';
import {
  SANCTUARY_SCENES,
  sanctuaryPhaseForHour,
  sanctuarySceneForHour,
  type SanctuaryDayPhase,
} from './useSanctuaryScene';

describe('sanctuaryPhaseForHour', () => {
  it.each<[number, SanctuaryDayPhase]>([
    [0, 'night'],
    [4, 'night'],
    [5, 'dawn'],
    [8, 'dawn'],
    [9, 'day'],
    [16, 'day'],
    [17, 'dusk'],
    [19, 'dusk'],
    [20, 'dusk'],
    [21, 'dusk'],
    [22, 'night'],
    [23, 'night'],
  ])('hour %i belongs to the %s phase', (hour, phase) => {
    expect(sanctuaryPhaseForHour(hour)).toBe(phase);
  });

  it('floors fractional hours and wraps out-of-range values', () => {
    expect(sanctuaryPhaseForHour(8.9)).toBe('dawn');
    expect(sanctuaryPhaseForHour(29)).toBe('dawn');
    expect(sanctuaryPhaseForHour(-1)).toBe('night');
  });
});

describe('sanctuarySceneForHour', () => {
  it('maps every phase to its scene', () => {
    expect(sanctuarySceneForHour(6)).toBe(SANCTUARY_SCENES.dawn);
    expect(sanctuarySceneForHour(12)).toBe(SANCTUARY_SCENES.day);
    expect(sanctuarySceneForHour(18)).toBe(SANCTUARY_SCENES.dusk);
    expect(sanctuarySceneForHour(23)).toBe(SANCTUARY_SCENES.night);
  });

  it('only clock scenes carry a clock face treatment', () => {
    expect(SANCTUARY_SCENES.dawn).toEqual({ variant: 'clock', clockFace: 'serif' });
    expect(SANCTUARY_SCENES.night).toEqual({ variant: 'clock', clockFace: 'oversized' });
    expect(SANCTUARY_SCENES.day.clockFace).toBeNull();
    expect(SANCTUARY_SCENES.dusk.clockFace).toBeNull();
  });
});
