import { createContext, useContext, type RefObject } from 'react';

export type OnboardingStepId =
  | 'welcome'
  | 'folders'
  | 'tools'
  | 'appearance'
  | 'playback'
  | 'visualizer'
  | 'privacy'
  | 'summary';

export interface OnboardingStepContextValue {
  stepId: OnboardingStepId;
  /** Per-step kanji watermark glyph supplied by the wizard shell. */
  kanji: string;
  /** Stable id the wizard uses to label the dialog's current heading. */
  headingId: string;
  /** Ref the wizard focuses on each step change for a11y. */
  headingRef: RefObject<HTMLHeadingElement | null>;
}

export const OnboardingStepContext = createContext<OnboardingStepContextValue | null>(null);

/** Read the shell-owned step chrome (kanji, heading wiring) from inside a step. */
export function useOnboardingStepContext(): OnboardingStepContextValue {
  const ctx = useContext(OnboardingStepContext);
  if (!ctx) {
    throw new Error('useOnboardingStepContext must be used within an OnboardingWizard step');
  }
  return ctx;
}
