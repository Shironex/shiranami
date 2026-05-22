import { useTranslation } from 'react-i18next';
import { Heart, Coffee } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { BUY_ME_A_COFFEE_URL } from '@/lib/constants';

export function SupportSection() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-4">
      <SettingsCard icon={Heart} title={t('sup.title')} subtitle={t('sup.subtitle')}>
        <div className="space-y-2.5 text-[13px] leading-[1.7] text-foreground/85">
          <p>
            {t('sup.p1Pre')}
            <span className="text-primary font-medium">{t('sup.p1Bold')}</span>
            {t('sup.p1Post')}
          </p>
          <p>
            {t('sup.p2Pre')}
            <span className="text-primary font-medium">{t('sup.p2Bold')}</span>
            {t('sup.p2Post')}
          </p>
          <p>
            {t('sup.p3Pre')}
            <span className="text-primary font-medium">{t('sup.p3Bold')}</span>
            {t('sup.p3Post')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => window.open(BUY_ME_A_COFFEE_URL, '_blank', 'noopener,noreferrer')}
          >
            <Coffee className="w-3.5 h-3.5" />
            {t('sup.action')}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
