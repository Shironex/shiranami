import type { ReactNode, RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { OnboardingStepContextValue, OnboardingStepId } from '../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IOnboardingWizardProps {
  /** Called once the wizard finishes (or is skipped) and its exit fog clears. */
  readonly onComplete: () => void;
}

/** One render-ready step entry: its glyph, dot label, and the step component. */
export interface IOnboardingStep {
  /** Stable step id (drives the dot aria + folder-nudge detection). */
  readonly id: OnboardingStepId;
  /** Per-step kanji watermark glyph supplied to the step layout. */
  readonly kanji: string;
  /** The step's component, rendered inside the shared step layout. */
  readonly Component: () => ReactNode;
  /** Localized `aria-label` for this step's progress dot. */
  readonly dotLabel: string;
  /** Whether this dot is the current step. */
  readonly isActive: boolean;
  /** Navigate directly to this step (no-op while exiting). */
  readonly onSelect: () => void;
}

export interface IOnboardingWizardView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Render-ready step entries for the progress dots and current step. */
  readonly steps: readonly IOnboardingStep[];
  /** The step currently displayed. */
  readonly currentStep: IOnboardingStep;
  /** Per-step chrome (kanji + heading wiring) provided to the step subtree. */
  readonly stepContextValue: OnboardingStepContextValue;
  /** Container ref the focus trap and exit animation hang off. */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /** Whether the wizard is on its first step (hides the Back control). */
  readonly isFirst: boolean;
  /** Whether the wizard is on its last step (turns the primary into Finish). */
  readonly isLast: boolean;
  /** Whether the entrance/exit animations are suppressed (reduced-motion / low-perf). */
  readonly disableMotion: boolean;
  /** Whether the exit fog-out is in progress (freezes interaction). */
  readonly isExiting: boolean;
  /** Whether the entrance fade-in is still pending (initial opacity 0). */
  readonly isEntering: boolean;
  /** Localized label for the primary advance/finish button. */
  readonly primaryLabel: string;
  /** Advance to the next step, or finish on the last step. */
  readonly onPrimary: () => void;
  /** Step back to the previous step. */
  readonly onBack: () => void;
  /** Skip the wizard entirely (equivalent to finishing). */
  readonly onSkip: () => void;
}
