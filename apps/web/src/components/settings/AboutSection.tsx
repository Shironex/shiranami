import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useAbout } from '@/hooks/useAbout';
import { Info, FolderOpen, Heart } from 'lucide-react';

export function AboutSection() {
  const { t } = useTranslation('settings');
  const version = useAppVersion();
  const { openLogsFolder } = useAbout();

  return (
    <SettingsCard icon={Info} title={t('abt.title')} subtitle={t('abt.subtitle')}>
      <div className="flex items-center gap-4 px-3 py-3">
        <img
          src="./mascot.png"
          alt={t('abt.altMascot')}
          className="w-16 h-16 rounded-2xl object-contain"
          draggable={false}
        />
        <div>
          <h4 className="font-display text-base font-semibold text-foreground">Shiranami</h4>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {t('abt.version', { version })}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 italic">
            {'\u767D\u6CE2'} &mdash; {t('abt.tagline')}
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-2 flex items-center gap-1">
            {t('abt.madeWith')}
            <Heart className="w-3 h-3 fill-rose-400 text-rose-400" />
            {t('abt.byShiro')}
          </p>
        </div>
      </div>

      {IS_ELECTRON && (
        <div className="px-3 pt-1 pb-2">
          <button
            onClick={() => openLogsFolder.mutate()}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t('abt.openLogs')}
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
