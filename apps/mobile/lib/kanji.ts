import { TILE_HUES, type TileHue } from '@/lib/tiles';
import { hashString } from '@/lib/hash';

export interface KanjiPick {
  glyph: string;
  hue: TileHue;
}

/**
 * Words in a title that pick a kanji, with the tile's hue. Short words match
 * whole words only ("sun" must not match "sunday"); longer ones also match
 * inside a word, so "snowfall" finds "snow". When several match, the one that
 * comes first in the title wins, then the earlier row here.
 */
const KEYWORDS: readonly (readonly [words: readonly string[], glyph: string, hue: TileHue])[] = [
  [['snow', 'winter', 'frost', 'ice', 'cold'], '雪', '250'],
  [['rain', 'drizzle', 'storm', 'thunder'], '雨', '220'],
  [['moon', 'lunar'], '月', '280'],
  [['star', 'galaxy', 'comet'], '星', '250'],
  [['night', 'midnight', 'late', 'dark'], '夜', '280'],
  [['sunset', 'dusk', 'evening', 'twilight'], '夕', '45'],
  [['morning', 'dawn', 'sunrise'], '朝', '45'],
  [['summer', 'sun', 'sunny'], '夏', '45'],
  [['sea', 'ocean', 'wave', 'waves', 'beach', 'shore', 'tide'], '波', '220'],
  [['river', 'stream'], '川', '190'],
  [['lake', 'water', 'pond'], '水', '190'],
  [['cloud', 'clouds', 'sky'], '雲', '220'],
  [['wind', 'breeze'], '風', '160'],
  [['sakura', 'cherry'], '桜', '345'],
  [['flower', 'bloom', 'blossom', 'petal'], '花', '345'],
  [['spring'], '春', '345'],
  [['autumn'], '秋', '15'],
  [['leaf', 'leaves', 'chill', 'chillhop'], '葉', '160'],
  [['forest', 'tree', 'trees', 'wood', 'woods'], '森', '160'],
  [['coffee', 'cafe', 'café'], '珈', '45'],
  [['tea'], '茶', '80'],
  [['lighthouse', 'lamp', 'lantern', 'light', 'glow'], '灯', '45'],
  [['fire', 'ember', 'embers', 'candle'], '火', '15'],
  [['sleep', 'sleeping', 'asleep', 'lullaby'], '眠', '280'],
  [['dream', 'dreams', 'dreaming'], '夢', '315'],
  [['owl', 'owls'], '梟', '280'],
  [['dance', 'dancing'], '舞', '315'],
  [['home', 'house', 'room'], '家', '45'],
  [['city', 'street', 'town', 'tokyo'], '街', '250'],
  [['train', 'travel', 'road', 'journey', 'drive'], '旅', '190'],
  [['love', 'heart'], '恋', '345'],
  [['alone', 'solitude', 'lonely'], '独', '220'],
  [['quiet', 'calm', 'peace', 'still', 'silence'], '静', '250'],
  [['window'], '窓', '280'],
  [['book', 'books', 'page', 'pages', 'letter'], '書', '80'],
  [['cat', 'cats'], '猫', '80'],
  [['bird', 'birds'], '鳥', '160'],
  [['song', 'music', 'melody', 'jazz'], '歌', '315'],
  [['loop', 'circle'], '輪', '45'],
  [['memory', 'memories', 'nostalgia', 'remember'], '憶', '315'],
  [['blue'], '青', '220'],
  [['girl', 'you'], '君', '45'],
];

/** Calm, generic glyphs for titles no keyword matches; one is picked by hash. */
const FALLBACK = [
  '音',
  '空',
  '光',
  '心',
  '詩',
  '和',
  '白',
  '凪',
  '時',
  '影',
  '想',
  '彩',
  '澄',
  '静',
  '灯',
  '夢',
] as const;

/** Whole-word match only for words this short. */
const WHOLE_WORD_MAX = 3;

interface Token {
  word: string;
  at: number;
}

/** Where the earliest of `words` appears in the title, or -1. */
function firstIndexOf(lower: string, words: readonly string[], tokens: Token[]): number {
  let best = -1;
  for (const word of words) {
    const at =
      word.length <= WHOLE_WORD_MAX
        ? (tokens.find(token => token.word === word)?.at ?? -1)
        : lower.indexOf(word);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

/**
 * The kanji and hue for a track or station without artwork. Deterministic:
 * the same title always gets the same tile.
 */
export function pickKanji(title: string): KanjiPick {
  const lower = title.toLowerCase();
  const tokens = [...lower.matchAll(/\p{L}+/gu)].map(m => ({ word: m[0], at: m.index ?? 0 }));

  let pick: KanjiPick | null = null;
  let pickAt = Infinity;
  for (const [words, glyph, hue] of KEYWORDS) {
    const at = firstIndexOf(lower, words, tokens);
    if (at >= 0 && at < pickAt) {
      pick = { glyph, hue };
      pickAt = at;
    }
  }
  if (pick) return pick;

  const hash = hashString(lower);
  return {
    glyph: FALLBACK[hash % FALLBACK.length],
    hue: TILE_HUES[Math.floor(hash / FALLBACK.length) % TILE_HUES.length],
  };
}

/**
 * Every glyph a tile can show. The embedded Shippori Mincho is subset to
 * exactly these (see scripts/subset-kanji-font.sh), so a glyph added above
 * needs a new subset; test/kanji.test.ts catches a stale one.
 */
export const KANJI_GLYPHS: string = [
  ...new Set([...KEYWORDS.map(([, glyph]) => glyph), ...FALLBACK]),
]
  .sort()
  .join('');
