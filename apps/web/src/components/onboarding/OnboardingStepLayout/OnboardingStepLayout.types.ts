import type { ReactNode, RefObject } from 'react';

export interface IOnboardingStepLayoutProps {
  /** Per-step kanji watermark glyph. */
  readonly kanji: string;
  /** Mono uppercase eyebrow, e.g. "01 · POINT IT AT YOUR FILES". */
  readonly stepMarker: ReactNode;
  /** Headline — supports an <em> accent emphasis via <Trans>. */
  readonly headline: ReactNode;
  readonly description: ReactNode;
  /** The real, working control for this step. */
  readonly children: ReactNode;
  /** Wires the left-pane heading id so the wizard can move focus to it. */
  readonly headingId?: string;
  /** Ref the wizard focuses on each step change for a11y. */
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
}

export interface IOnboardingStepLayoutView {
  /** Per-step kanji watermark glyph. */
  readonly kanji: string;
  /** Mono uppercase eyebrow. */
  readonly stepMarker: ReactNode;
  /** Headline node. */
  readonly headline: ReactNode;
  /** Body narrative node. */
  readonly description: ReactNode;
  /** The interactive control rendered in the right pane. */
  readonly children: ReactNode;
  /** Heading id wired for focus management. */
  readonly headingId?: string;
  /** Heading ref the wizard focuses on each step change. */
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
}
