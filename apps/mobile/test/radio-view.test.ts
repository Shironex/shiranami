import { PRESET_COUNT, radioNotice, radioPresets, radioSubtitle } from '@/lib/radio-view';
import type { RadioStation } from '@/lib/radio';

const station = (id: string): RadioStation => ({
  id,
  name: `Station ${id}`,
  url: '',
  urlResolved: '',
  homepage: null,
  favicon: null,
  country: null,
  countryCode: null,
  codec: null,
  bitrate: null,
  tags: [],
});

describe('radioPresets', () => {
  it('keeps the first saved stations, in order', () => {
    const saved = ['a', 'b', 'c', 'd', 'e', 'f'].map(station);
    expect(radioPresets(saved).map(s => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(radioPresets(saved)).toHaveLength(PRESET_COUNT);
    expect(radioPresets([station('a')])).toHaveLength(1);
  });
});

describe('radioSubtitle', () => {
  it('names the station on air first', () => {
    expect(radioSubtitle('Chillhop Radio', 4)).toBe('Chillhop Radio is live');
  });

  it('counts saved stations when nothing plays', () => {
    expect(radioSubtitle(null, 1)).toBe('1 saved station');
    expect(radioSubtitle(null, 4)).toBe('4 saved stations');
    expect(radioSubtitle(null, 0)).toBe('Live stations from everywhere');
  });
});

describe('radioNotice', () => {
  it('blames the station when it will not play', () => {
    expect(radioNotice('Box Lofi', 'timeout', 'net')).toEqual({
      text: 'Box Lofi did not answer.',
      retry: 'station',
    });
  });

  it('falls back to the list error', () => {
    expect(radioNotice(null, 'timeout', 'net')).toEqual({
      text: 'Stations did not load.',
      retry: 'list',
    });
    expect(radioNotice('Box Lofi', null, 'net')?.retry).toBe('list');
  });

  it('stays quiet when all is well', () => {
    expect(radioNotice('Box Lofi', null, null)).toBeNull();
  });
});
