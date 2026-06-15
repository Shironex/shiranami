import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useOnboardingStepContext } from '../../stepContext';
import type { IVisualizerStepView } from './VisualizerStep.types';

export function useVisualizerStep(): IVisualizerStepView {
  const { t } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const setVisualizerStyle = useUIStore(s => s.setVisualizerStyle);

  return {
    t,
    stepContext,
    visualizerStyle,
    onSelectVisualizerStyle: setVisualizerStyle,
  };
}
