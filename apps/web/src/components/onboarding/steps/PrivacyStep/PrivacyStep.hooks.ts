import { useTranslation } from 'react-i18next';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { useOnboardingStepContext } from '../../stepContext';
import type { IPrivacyStepView } from './PrivacyStep.types';

export function usePrivacyStep(): IPrivacyStepView {
  const { t } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();
  const enabled = useTelemetryStore(s => s.enabled);
  const setEnabled = useTelemetryStore(s => s.setEnabled);
  const performanceEnabled = useTelemetryStore(s => s.performanceEnabled);
  const setPerformanceEnabled = useTelemetryStore(s => s.setPerformanceEnabled);

  const sentItems = t('privacy.sent', { returnObjects: true }) as string[];
  const notSentItems = t('privacy.notSent', { returnObjects: true }) as string[];

  return {
    t,
    stepContext,
    sentItems,
    notSentItems,
    telemetryEnabled: enabled,
    onSetTelemetryEnabled: value => void setEnabled(value),
    // Performance monitoring is a sub-option of crash reporting (it only sends
    // data when reporting is on), so it only appears once reporting is enabled —
    // matching the Settings · Privacy disclosure.
    showPerformanceToggle: enabled,
    performanceEnabled,
    onSetPerformanceEnabled: value => void setPerformanceEnabled(value),
  };
}
