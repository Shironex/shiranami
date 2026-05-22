import { useTranslation, Trans } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { SettingsToggleRow } from '@/components/settings/SettingsCard';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

export function PrivacyStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();
  const enabled = useTelemetryStore(s => s.enabled);
  const setEnabled = useTelemetryStore(s => s.setEnabled);

  const sent = t('privacy.sent', { returnObjects: true }) as string[];
  const notSent = t('privacy.notSent', { returnObjects: true }) as string[];

  return (
    <OnboardingStepLayout
      kanji={kanji}
      headingId={headingId}
      headingRef={headingRef}
      stepMarker={t('privacy.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="privacy.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('privacy.description')}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">{t('privacy.sentTitle')}</p>
            <ul className="space-y-1.5">
              {sent.map(item => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">{t('privacy.notSentTitle')}</p>
            <ul className="space-y-1.5">
              {notSent.map(item => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground"
                >
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <SettingsToggleRow
          divider
          label={t('privacy.toggleLabel')}
          description={t('privacy.toggleDesc')}
          checked={enabled}
          onCheckedChange={setEnabled}
        />

        <p className="text-[11px] leading-snug text-muted-foreground/70">{t('privacy.footnote')}</p>
      </div>
    </OnboardingStepLayout>
  );
}
