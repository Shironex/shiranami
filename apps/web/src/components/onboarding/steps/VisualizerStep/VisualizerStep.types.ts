import type { useTranslation } from 'react-i18next';
import type { VisualizerStyle } from '@/stores/useUIStore';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IVisualizerStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Currently selected visualizer style. */
  readonly visualizerStyle: VisualizerStyle;
  /** Select a visualizer style. */
  readonly onSelectVisualizerStyle: (style: VisualizerStyle) => void;
}
