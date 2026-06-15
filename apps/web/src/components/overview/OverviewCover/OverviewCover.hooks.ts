import type { IOverviewCoverProps, IOverviewCoverView } from './OverviewCover.types';

/** Small kanji vocabulary the placeholder glyph is drawn from. */
const GLYPHS = ['夜', '炎', '雨', '風', '雪', '月', '花', '空', '光', '海', '星', '森'];

function pickGlyph(seed: string, hash: number): string {
  // Prefer the first CJK character in the title when present (matches the
  // mockup's per-track glyphs), else fall back to a hashed pick.
  const cjk = [...seed].find(ch => /[぀-ヿ一-龯]/.test(ch));
  if (cjk) return cjk;
  return GLYPHS[hash % GLYPHS.length]!;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function useOverviewCover({ title, seed }: IOverviewCoverProps): IOverviewCoverView {
  const source = seed || title;
  const hash = hashString(source);
  // Rotate around the theme's primary hue rather than emitting a fixed oklch:
  // a CSS hue-rotate keeps every cover in the active theme's family.
  const rotate = (hash % 120) - 60;
  const glyph = pickGlyph(source, hash);

  return { rotate, glyph };
}
