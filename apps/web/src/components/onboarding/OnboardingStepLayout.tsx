import type { ReactNode, RefObject } from 'react';
import { OnboardingKanji } from './OnboardingKanji';

interface OnboardingStepLayoutProps {
  /** Per-step kanji watermark glyph. */
  kanji: string;
  /** Mono uppercase eyebrow, e.g. "01 · POINT IT AT YOUR FILES". */
  stepMarker: ReactNode;
  /** Headline — supports an <em> accent emphasis via <Trans>. */
  headline: ReactNode;
  description: ReactNode;
  /** The real, working control for this step. */
  children: ReactNode;
  /** Wires the left-pane heading id so the wizard can move focus to it. */
  headingId?: string;
  /** Ref the wizard focuses on each step change for a11y. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

/**
 * Two-pane magazine split shared by every onboarding step. Left pane carries
 * the kanji watermark + eyebrow + headline + body narrative; right pane hosts
 * the real interactive control. A subtle scrim sits behind the left pane so the
 * muted body copy clears WCAG AA over the blurred rainy scene (§7).
 */
export function OnboardingStepLayout({
  kanji,
  stepMarker,
  headline,
  description,
  children,
  headingId,
  headingRef,
}: OnboardingStepLayoutProps) {
  return (
    <div className="grid h-full w-full gap-8 md:grid-cols-[1.05fr_1fr] md:gap-12">
      {/* Left — narrative */}
      <div className="relative flex min-w-0 flex-col justify-center overflow-hidden">
        <OnboardingKanji glyph={kanji} />
        {/* AA contrast scrim behind the copy */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -m-6 rounded-3xl"
          style={{
            background: 'oklch(from var(--background) calc(l * 0.6) c h / 0.35)',
            backdropFilter: 'blur(22px)',
          }}
        />
        <div className="relative max-w-md">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            {stepMarker}
          </p>
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="m-0 font-serif text-[clamp(30px,4.4vw,46px)] italic leading-[1.05] tracking-[-0.015em] text-foreground focus:outline-none"
          >
            {headline}
          </h2>
          <p className="mt-5 text-[15px] leading-[1.7] text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Right — interactive control */}
      <div className="relative flex min-w-0 flex-col justify-center">
        <div className="glass rounded-2xl border border-border/30 bg-surface/50 p-5 shadow-[0_8px_40px_-12px_oklch(from_var(--background)_calc(l*0.4)_c_h_/_0.6)]">
          {children}
        </div>
      </div>
    </div>
  );
}
