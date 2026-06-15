import type { useTranslation } from 'react-i18next';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISummaryStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Whether the download-helpers recap row is shown (desktop only). */
  readonly showTools: boolean;
  /** Selected interface language label. */
  readonly languageValue: string;
  /** Localized music-folders count label. */
  readonly foldersValue: string;
  /** Whether any folder was configured (highlights the row). */
  readonly hasFolders: boolean;
  /** Download-helpers recap value. */
  readonly toolsValue: string;
  /** Composed playback recap (resume · crossfade · discord). */
  readonly playbackValue: string;
  /** Selected theme label. */
  readonly themeValue: string;
  /** Selected visualizer label. */
  readonly visualizerValue: string;
  /** Crash-reports recap value. */
  readonly privacyValue: string;
  /** Whether crash reporting is enabled (highlights the row). */
  readonly telemetryEnabled: boolean;
}
