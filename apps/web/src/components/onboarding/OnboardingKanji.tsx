interface IOnboardingKanjiProps {
  /** Per-step glyph, e.g. 白波 / 蔵 / 夜 / 波. Not translated — it's brand art. */
  readonly glyph: string;
}

/**
 * Faint kanji watermark behind the left narrative pane. Purely decorative —
 * derived from --primary at very low alpha so it reads as a textural wash, not
 * legible copy. Mirrors the splash wordmark's role without any animation.
 */
export function OnboardingKanji({ glyph }: IOnboardingKanjiProps) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 select-none leading-none"
      style={{
        fontFamily: "'Shippori Mincho', 'Noto Sans JP', 'Hiragino Sans', serif",
        fontWeight: 800,
        fontSize: 'clamp(160px, 30vw, 340px)',
        color: 'oklch(from var(--primary) l c h / 0.05)',
        textShadow: '0 0 80px oklch(from var(--primary) l c h / 0.08)',
      }}
    >
      {glyph}
    </span>
  );
}
