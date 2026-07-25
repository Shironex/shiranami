import { useOnboardingKanji } from './OnboardingKanji.hooks';
import type { IOnboardingKanjiProps } from './OnboardingKanji.types';

/**
 * Faint kanji watermark behind the left narrative pane. Purely decorative —
 * derived from --primary at very low alpha so it reads as a textural wash, not
 * legible copy. Mirrors the splash wordmark's role without any animation.
 *
 * The glyph is painted as CSS generated content (`::before` via
 * `content: attr(data-kanji)`) rather than a text node so it stays out of the
 * accessibility tree entirely — assistive tech never announces it, and axe's
 * color-contrast rule (which still measures `aria-hidden` *text*) doesn't flag
 * the intentional 5%-alpha wash against an opaque light background.
 */
export default function OnboardingKanji(props: IOnboardingKanjiProps) {
  const { glyph } = useOnboardingKanji(props);

  return (
    <span
      aria-hidden="true"
      data-kanji={glyph}
      className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 select-none leading-none before:content-[attr(data-kanji)]"
      style={{
        fontFamily: "'Shippori Mincho', 'Noto Sans JP', 'Hiragino Sans', serif",
        fontWeight: 800,
        fontSize: 'clamp(160px, 30vw, 340px)',
        color: 'oklch(from var(--primary) l c h / 0.05)',
        textShadow: '0 0 80px oklch(from var(--primary) l c h / 0.08)',
      }}
    />
  );
}
