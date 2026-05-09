interface SplashWordmarkProps {
  reducedMotion: boolean;
}

/**
 * 白波 wordmark etched on the glass.
 *
 * Sits behind the rain layer so the streaks pass in front of it — the
 * compositional read is that the wordmark is on the inside of the glass and
 * the viewer is looking through both the etching and the rain at once.
 *
 * Size is 64px (up from 56 in Direction A) to compensate for the lower 0.55
 * alpha and the rain layer that competes for attention.
 *
 * Entrance: blur 4px → 0 + opacity 0 → 0.55 over 600ms (220ms delay).
 * The blur-to-clarity reads as the etching being seen through condensation
 * that is wiping clear. Under reduced-motion, the blur step is dropped and
 * it fades opacity-only.
 *
 * CJK fallback pinned explicitly — Sora lacks full CJK glyph coverage and
 * falls back to Hiragino Sans / Noto Sans JP which have different metrics.
 */
export function SplashWordmark({ reducedMotion }: SplashWordmarkProps) {
  const animation = reducedMotion
    ? 'shiranami-wordmark-fade 300ms ease-out 220ms both'
    : 'shiranami-wordmark-etch 600ms ease-out 220ms both';

  return (
    <div
      className="flex flex-col items-center gap-1"
      aria-label="白波 Shiranami"
      style={{ animation }}
    >
      <span
        className="text-[64px] font-semibold leading-none tracking-[-0.02em] select-none"
        style={{
          fontFamily: "'Sora', 'Noto Sans JP', 'Hiragino Sans', system-ui",
          color: 'oklch(from var(--foreground) l c h / 0.55)',
        }}
      >
        白波
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.28em] select-none"
        style={{ color: 'oklch(from var(--muted-foreground) l c h / 0.65)' }}
      >
        lofi · since 2024
      </span>
    </div>
  );
}
