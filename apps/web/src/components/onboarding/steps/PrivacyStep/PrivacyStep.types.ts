import type { useTranslation } from 'react-i18next';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPrivacyStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Bullet items describing what is sent in a crash report. */
  readonly sentItems: readonly string[];
  /** Bullet items describing what is never sent. */
  readonly notSentItems: readonly string[];
  /** Whether crash reporting is enabled. */
  readonly telemetryEnabled: boolean;
  /** Toggle crash reporting. */
  readonly onSetTelemetryEnabled: (value: boolean) => void;
  /** Whether the performance-monitoring sub-toggle is shown (reporting on). */
  readonly showPerformanceToggle: boolean;
  /** Whether performance monitoring is enabled. */
  readonly performanceEnabled: boolean;
  /** Toggle performance monitoring. */
  readonly onSetPerformanceEnabled: (value: boolean) => void;
}
