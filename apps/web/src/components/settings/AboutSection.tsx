import { useTranslation } from 'react-i18next';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { useAppVersion } from '@/hooks/useAppVersion';
import { Info } from 'lucide-react';

export function AboutSection() {
  const { t } = useTranslation('settings');
  const version = useAppVersion();

  return (
    <SettingsCard
      icon={Info}
      title={t('abt.title')}
      subtitle={t('abt.subtitle')}
    >
      <div className="flex items-center gap-4 px-3 py-3">
        <img
          src="./mascot.png"
          alt={t('abt.altMascot')}
          className="w-16 h-16 rounded-2xl object-contain"
          draggable={false}
        />
        <div>
          <h4 className="font-display text-base font-semibold text-foreground">
            Shiranami
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {t('abt.version', { version })}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 italic">
            {'\u767D\u6CE2'} &mdash; {t('abt.tagline')}
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-2">
            {t('abt.madeWithLove')}
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
