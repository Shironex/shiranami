import { useTranslation } from 'react-i18next';
import { ShieldCheck, Info } from 'lucide-react';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsInfoCallout,
} from '@/components/settings/SettingsCard';

export function PrivacySection() {
  const { t } = useTranslation('settings');
  const enabled = useTelemetryStore(s => s.enabled);
  const setEnabled = useTelemetryStore(s => s.setEnabled);

  const sent = t('priv.sent', { returnObjects: true }) as string[];
  const notSent = t('priv.notSent', { returnObjects: true }) as string[];

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
    </div>
  );
}
