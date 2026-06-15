import { Trans } from 'react-i18next';
import { Heart, Coffee, HeartHandshake } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { useSupportSection } from './SupportSection.hooks';

export default function SupportSection() {
  const { t, buyMeACoffeeUrl, githubSponsorsUrl, onMarkSeen } = useSupportSection();

  return (
    <div className="space-y-4">
      <SettingsCard icon={Heart} title={t('sup.title')} subtitle={t('sup.subtitle')}>
        <div className="space-y-2.5 text-[13px] leading-[1.7] text-foreground/85">
          <p>
            <Trans
              t={t}
              i18nKey="sup.p1"
              components={{ 1: <span className="text-primary font-medium" /> }}
            />
          </p>
          <p>
            <Trans
              t={t}
              i18nKey="sup.p2"
              components={{ 1: <span className="text-primary font-medium" /> }}
            />
          </p>
          <p>
            <Trans
              t={t}
              i18nKey="sup.p3"
              components={{ 1: <span className="text-primary font-medium" /> }}
            />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" asChild onClick={onMarkSeen}>
            <a href={buyMeACoffeeUrl} target="_blank" rel="noopener noreferrer">
              <Coffee className="w-3.5 h-3.5" />
              {t('sup.action')}
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild onClick={onMarkSeen}>
            <a href={githubSponsorsUrl} target="_blank" rel="noopener noreferrer">
              <HeartHandshake className="w-3.5 h-3.5" />
              {t('sup.sponsor')}
            </a>
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
