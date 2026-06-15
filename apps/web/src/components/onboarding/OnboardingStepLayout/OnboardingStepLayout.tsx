import { OnboardingKanji } from '../OnboardingKanji';
import { useOnboardingStepLayout } from './OnboardingStepLayout.hooks';
import type { IOnboardingStepLayoutProps } from './OnboardingStepLayout.types';

/**
 * Two-pane magazine split shared by every onboarding step. Left pane carries
 * the kanji watermark + eyebrow + headline + body narrative; right pane hosts
 * the real interactive control. A subtle scrim sits behind the left pane so the
 * muted body copy clears WCAG AA over the blurred rainy scene (§7).
 */
export default function OnboardingStepLayout(props: IOnboardingStepLayoutProps) {
  const { kanji, stepMarker, headline, description, children, headingId, headingRef } =
    useOnboardingStepLayout(props);

  return (
    <div className="grid h-full w-full gap-8 md:grid-cols-[1.05fr_1fr] md:gap-12">
      {/* Left — narrative. Content block is centered within its pane so the copy
          never hugs the window edge on wide/full-screen displays, while the
          grid itself still spans the full width (no dead side-bands). */}
      <div className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden">
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

      {/* Right — interactive control. Centered in its pane with a comfortable
          max width: never shrinks below its natural size at normal window
          widths, just stops stretching too wide on full-screen displays. The
          card scrolls inside itself (max-h-full) so tall steps like Appearance
          stay reachable on short windows instead of clipping off-screen. */}
      <div className="relative flex min-h-0 min-w-0 flex-col items-center justify-center">
        <div className="glass max-h-full w-full max-w-xl overflow-y-auto scrollbar-thin rounded-2xl border border-border/30 bg-surface/50 p-5 shadow-[0_8px_40px_-12px_oklch(from_var(--background)_calc(l*0.4)_c_h_/_0.6)]">
          {children}
        </div>
      </div>
    </div>
  );
}
