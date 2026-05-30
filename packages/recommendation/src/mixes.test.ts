import { describe, it, expect } from 'vitest';
import { buildSmartMixes, type MixTrack } from './mixes.js';

function track(overrides: Partial<MixTrack> = {}): MixTrack {
  return { trackId: 't', genre: null, year: null, playCount: 0, ...overrides };
}

/** N focus-genre tracks with distinct ids and ascending play counts. */
function focusTracks(n: number, year: number | null = null): MixTrack[] {
  return Array.from({ length: n }, (_, i) =>
    track({ trackId: `focus-${i}`, genre: 'lofi', year, playCount: i })
  );
}

describe('buildSmartMixes', () => {
  it('returns [] when no mix reaches the minimum size', () => {
    expect(buildSmartMixes(focusTracks(2), { hour: 14 })).toEqual([]);
  });

  it('produces a focus mix from instrumental/calm genres', () => {
    const mixes = buildSmartMixes(focusTracks(6), { hour: 14 });
    const focus = mixes.find(m => m.kind === 'focus');
    expect(focus).toBeDefined();
    expect(focus!.trackIds.length).toBe(6);
  });

  it('ranks picks by play count, most-played first', () => {
    const mixes = buildSmartMixes(focusTracks(6), { hour: 14 });
    const focus = mixes.find(m => m.kind === 'focus')!;
    // focusTracks assigns playCount = index, so highest index leads.
    expect(focus.trackIds[0]).toBe('focus-5');
    expect(focus.trackIds[focus.trackIds.length - 1]).toBe('focus-0');
  });

  it('adds a late-night mix in the small hours and not midday', () => {
    expect(buildSmartMixes(focusTracks(6), { hour: 2 }).some(m => m.kind === 'late-night')).toBe(
      true
    );
    expect(buildSmartMixes(focusTracks(6), { hour: 14 }).some(m => m.kind === 'late-night')).toBe(
      false
    );
  });

  it('adds a rainy-day mix only when weather is rain/storm/fog', () => {
    expect(
      buildSmartMixes(focusTracks(6), { hour: 14, weather: 'rain' }).some(
        m => m.kind === 'rainy-day'
      )
    ).toBe(true);
    expect(
      buildSmartMixes(focusTracks(6), { hour: 14, weather: 'clear' }).some(
        m => m.kind === 'rainy-day'
      )
    ).toBe(false);
  });

  it('degrades to time + decade mixes when no weather signal is given', () => {
    const mixes = buildSmartMixes(focusTracks(6), { hour: 14 });
    expect(mixes.every(m => m.kind !== 'rainy-day' && m.kind !== 'sunny-day')).toBe(true);
  });

  it('builds decade mixes bucketed by release year, newest first', () => {
    const tracks = [
      ...focusTracks(6, 1994),
      ...focusTracks(6, 2017).map((t, i) => ({ ...t, trackId: `b-${i}` })),
    ];
    const decades = buildSmartMixes(tracks, { hour: 14 }).filter(m => m.kind === 'decade');
    expect(decades.map(m => m.decade)).toEqual([2010, 1990]);
  });

  it('drops decades that are too small', () => {
    const tracks = [
      ...focusTracks(6, 2017),
      track({ trackId: 'lonely', genre: 'lofi', year: 1985, playCount: 1 }),
    ];
    const decades = buildSmartMixes(tracks, { hour: 14 }).filter(m => m.kind === 'decade');
    expect(decades.map(m => m.decade)).toEqual([2010]);
  });
});
