import subset from '../assets/fonts/ShipporiMincho_700Bold.glyphs.json';
import { KANJI_GLYPHS, pickKanji } from '@/lib/kanji';
import { TILE_HUES } from '@/lib/tiles';

describe('pickKanji', () => {
  it('picks the keyword glyph and its hue', () => {
    expect(pickKanji('Snowfall')).toEqual({ glyph: '雪', hue: '250' });
    expect(pickKanji('rain_on_window_v3')).toEqual({ glyph: '雨', hue: '220' });
    expect(pickKanji('Moonlit Walk').glyph).toBe('月');
  });

  it('takes the keyword that comes first in the title', () => {
    expect(pickKanji('Owls of the Night').glyph).toBe('梟');
    expect(pickKanji('Night Owls').glyph).toBe('夜');
  });

  it('matches short words only as whole words', () => {
    expect(pickKanji('Sun').glyph).toBe('夏');
    expect(pickKanji('Sunday Drive').glyph).toBe('旅');
    expect(pickKanji('Seashell').glyph).not.toBe('波');
  });

  it('is case insensitive', () => {
    expect(pickKanji('MIDNIGHT COFFEE')).toEqual(pickKanji('midnight coffee'));
  });

  it('falls back to a stable hashed glyph and hue', () => {
    const first = pickKanji('Aruarian Xyzzy');
    expect(pickKanji('Aruarian Xyzzy')).toEqual(first);
    expect(KANJI_GLYPHS).toContain(first.glyph);
    expect(TILE_HUES).toContain(first.hue);
  });

  it('spreads unmatched titles over several glyphs', () => {
    const titles = Array.from({ length: 40 }, (_, i) => `untitled ${i}`);
    expect(new Set(titles.map(t => pickKanji(t).glyph)).size).toBeGreaterThan(6);
  });

  it('only uses hues the theme generated', () => {
    for (const title of ['snow', 'rain', 'coffee', 'qqq', 'love song']) {
      expect(TILE_HUES).toContain(pickKanji(title).hue);
    }
  });
});

describe('kanji font subset', () => {
  it('holds every glyph a tile can show (run scripts/subset-kanji-font.sh)', () => {
    expect(subset.glyphs).toBe(KANJI_GLYPHS);
  });
});
