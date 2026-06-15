import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { initSentryRenderer, captureException } from '@/lib/sentry';
import type { IPrivacySectionView } from './PrivacySection.types';

/**
 * Dev/test affordance gate. The "Send test event" button is only meaningful
 * when Sentry can actually init in this build — a dev server, or a build with
 * the renderer force-enable flag set for local testing. It never renders in a
 * normal production build, so users never see it.
 */
const SHOW_TEST_BUTTON = import.meta.env.DEV || import.meta.env.VITE_SENTRY_FORCE_ENABLE === 'true';

export function usePrivacySection(): IPrivacySectionView {
  const { t } = useTranslation('settings');
  const enabled = useTelemetryStore(s => s.enabled);
  const setEnabled = useTelemetryStore(s => s.setEnabled);
  const performanceEnabled = useTelemetryStore(s => s.performanceEnabled);
  const setPerformanceEnabled = useTelemetryStore(s => s.setPerformanceEnabled);
  const bootEnabled = useTelemetryStore(s => s.bootEnabled);
  const bootPerformanceEnabled = useTelemetryStore(s => s.bootPerformanceEnabled);
  const [sentRecently, setSentRecently] = useState(false);

  // Sentry reads its config once, before the app 'ready' event, so config changes
  // only take effect on the next launch. Derived from the boot snapshot (not local
  // state) so the warning survives navigating away and back. Turning reporting OFF
  // is immediate (main closes the client at runtime), so it never needs a restart.
  const needsRestart =
    (enabled && !bootEnabled) ||
    (enabled && bootEnabled && performanceEnabled !== bootPerformanceEnabled);

  const sentItems = t('priv.sent', { returnObjects: true }) as string[];
  const notSentItems = t('priv.notSent', { returnObjects: true }) as string[];

  async function sendTestEvent(): Promise<void> {
    // Ensure Sentry is initialized — the boot-time call in main.tsx returns
    // early when consent was off, so toggling it on later needs this nudge.
    await initSentryRenderer();
    captureException(new Error(`Sentry test event — ${new Date().toISOString()}`));
    setSentRecently(true);
    toast.success(t('priv.testSent'));
    window.setTimeout(() => setSentRecently(false), 2500);
  }

  return {
    t,
    enabled,
    performanceEnabled,
    needsRestart,
    sentItems,
    notSentItems,
    showTestCard: SHOW_TEST_BUTTON && enabled && !needsRestart,
    sentRecently,
    onToggleEnabled: value => void setEnabled(value),
    onTogglePerformance: value => void setPerformanceEnabled(value),
    onSendTestEvent: () => void sendTestEvent(),
  };
}
