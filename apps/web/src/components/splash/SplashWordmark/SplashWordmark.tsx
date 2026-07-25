import { useSplashWordmark } from './SplashWordmark.hooks';
import type { ISplashWordmarkProps } from './SplashWordmark.types';

/**
 * Big off-center 白波 reflection on the glass.
 *
 * A large, low-alpha reflection sitting off to the upper-left, rotated -2deg —
 * the kanji read as a faint reflection cast across the wet pane rather than a
 * centered logo.
 *
 * Sits behind the rain + droplets so the streaks pass in front of it: the
 * compositional read is the reflection is on the inside of the glass and the
 * viewer looks through both the etching and the rain at once.
 *
 * CJK fallback pinned explicitly: Shippori Mincho (mock face, heavier serif),
 * then Noto Sans JP / Hiragino Sans which have full CJK coverage. Sora lacks
 * CJK glyphs so it is intentionally not in this chain.
 *
 * Mock literal mapping: reflection color `oklch(0.85 0.14 295 / 0.06)` ->
 * `--foreground` at low alpha (cool glass reflection, not violet).
 */
export default function SplashWordmark(props: ISplashWordmarkProps) {
  const { animation } = useSplashWordmark(props);

  return (
    <span
      className="absolute select-none leading-[0.85]"
      aria-label="白波 Shiranami"
      style={{
        top: '20%',
        left: '5%',
        fontFamily: "'Shippori Mincho', 'Noto Sans JP', 'Hiragino Sans', serif",
        fontWeight: 800,
        fontSize: 'clamp(140px, 22vw, 220px)',
        letterSpacing: '-0.05em',
        color: 'oklch(from var(--foreground) l c h / 0.07)',
        transform: 'rotate(-2deg)',
        animation,
      }}
    >
      白波
    </span>
  );
}
