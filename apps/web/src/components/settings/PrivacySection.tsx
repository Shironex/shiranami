import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldCheck, Info, Bug, Check } from 'lucide-react';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { initSentryRenderer, captureException } from '@/lib/sentry';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsInfoCallout,
} from '@/components/settings/SettingsCard';

/**
 * Dev/test affordance gate. The "Send test event" button is only meaningful
 * when Sentry can actually init in this build — a dev server, or a build with
 * the renderer force-enable flag set for local testing. It never renders in a
 * normal production build, so users never see it.
 */
const SHOW_TEST_BUTTON = import.meta.env.DEV || import.meta.env.VITE_SENTRY_FORCE_ENABLE === 'true';

export function PrivacySection() {
  const { t } = useTranslation('settings');
  const enabled = useTelemetryStore(s => s.enabled);
  const setEnabled = useTelemetryStore(s => s.setEnabled);
  const [sentRecently, setSentRecently] = useState(false);

  const sent = t('priv.sent', { returnObjects: true }) as string[];
  const notSent = t('priv.notSent', { returnObjects: true }) as string[];

  async function sendTestEvent() {
    // Ensure Sentry is initialized — the boot-time call in main.tsx returns
    // early when consent was off, so toggling it on later needs this nudge.
    await initSentryRenderer();
    captureException(new Error(`Sentry test event — ${new Date().toISOString()}`));
    setSentRecently(true);
    toast.success(t('priv.testSent'));
    window.setTimeout(() => setSentRecently(false), 2500);
  }

  return (
    <div className="space-y-4">
      <SettingsCard icon={ShieldCheck} title={t('priv.title')} subtitle={t('priv.subtitle')}>
        <SettingsToggleRow
          label={t('priv.toggleLabel')}
          description={t('priv.toggleDesc')}
          checked={enabled}
          onCheckedChange={setEnabled}
        />

        <div className="grid grid-cols-1 gap-4 border-t border-border/30 pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{t('priv.sentTitle')}</p>
            <ul className="space-y-1 text-[13px] leading-snug text-muted-foreground">
              {sent.map(item => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{t('priv.notSentTitle')}</p>
            <ul className="space-y-1 text-[13px] leading-snug text-muted-foreground">
              {notSent.map(item => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </SettingsCard>

      <SettingsInfoCallout icon={Info}>{t('priv.note')}</SettingsInfoCallout>

      {SHOW_TEST_BUTTON && enabled && (
        <SettingsCard icon={Bug} title={t('priv.testTitle')} subtitle={t('priv.testDesc')}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-border/40"
              onClick={() => void sendTestEvent()}
            >
              {sentRecently ? <Check className="h-3.5 w-3.5" /> : <Bug className="h-3.5 w-3.5" />}
              {sentRecently ? t('priv.testSent') : t('priv.testButton')}
            </Button>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {t('priv.testDevOnly')}
            </span>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
