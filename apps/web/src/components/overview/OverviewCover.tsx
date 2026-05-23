import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { cn } from '@/lib/utils';

interface OverviewCoverProps {
  albumArt?: string | null;
  title: string;
  /** Seed for the deterministic gradient + glyph (album or artist name). */
  seed: string;
  className?: string;
}

/**
 * Cover art for Overview rows/cards. Shows the real album art when present,
 * otherwise a deterministic gradient + a representative glyph derived from the
 * seed — the mockup's `.cv`/`.thumb` look, but the gradient reads `--primary`
 * via a hue rotation so it re-tints with the active theme instead of being
 * locked to lavender.
 */
export function OverviewCover({ albumArt, title, seed, className }: OverviewCoverProps) {
  const hash = hashString(seed || title);
  // Rotate around the theme's primary hue rather than emitting a fixed oklch:
  // a CSS hue-rotate keeps every cover in the active theme's family.
  const rotate = (hash % 120) - 60;
  const glyph = pickGlyph(seed || title, hash);

  return (
    <TrackThumbnail
      albumArt={albumArt}
      alt={title}
      className={cn('rounded-xl', className)}
      fallback={
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/70 to-primary/15"
          style={{ filter: `hue-rotate(${rotate}deg)` }}
        >
          <span className="select-none font-display text-lg text-white/90">{glyph}</span>
        </div>
      }
    />
  );
}

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
