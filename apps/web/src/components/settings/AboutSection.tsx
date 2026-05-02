import { useTranslation } from 'react-i18next';
import { Globe, BookOpen, FolderOpen, Music2 } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useAbout } from '@/hooks/useAbout';

export function AboutSection() {
  const { t } = useTranslation('settings');
  const version = useAppVersion();
  const { openLogsFolder } = useAbout();

  const heroIcon = (
    <div className="w-[42px] h-[42px] rounded-xl bg-primary/10 border border-border/30 flex items-center justify-center overflow-hidden flex-shrink-0">
      <img
        src="./mascot.png"
        alt={t('abt.altMascot')}
        className="w-9 h-9 object-contain"
        draggable={false}
      />
    </div>
  );

  const heroSubtitle = (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-mono font-medium text-primary tabular-nums">
        v{version ?? '…'}
      </span>
      <span className="text-[11.5px] text-muted-foreground">
        {'白波'} &mdash; {t('abt.tagline')}
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Card 1 — Hero */}
      <SettingsCard iconSlot={heroIcon} title="Shiranami" subtitle={heroSubtitle}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="border-border/40" asChild>
            <a href="https://github.com/Shironex/shiranami" target="_blank" rel="noreferrer">
              <Globe className="w-3.5 h-3.5" />
              {t('abt.github')}
            </a>
          </Button>
          <Button variant="outline" size="sm" className="border-border/40" asChild>
            <a
              href="https://github.com/Shironex/shiranami/releases"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {t('abt.changelog')}
            </a>
          </Button>
        </div>
      </SettingsCard>

      {/* Card 2 — Story */}
      <SettingsCard icon={Music2} title={t('abt.storyTitle')} subtitle={t('abt.storySubtitle')}>
        <div className="space-y-2.5 text-[13px] leading-[1.7] text-foreground/85">
          <p>
            {t('abt.storyP1Pre')}
            <span className="text-primary font-medium">{t('abt.storyP1Bold')}</span>
            {t('abt.storyP1Post')}
          </p>
          <p>
            {t('abt.storyP2Pre')}
            <span className="text-primary font-medium">{t('abt.storyP2Bold')}</span>
            {t('abt.storyP2Post')}
          </p>
          <p>
            {t('abt.storyP3Pre')}
            <span className="text-primary font-medium">{t('abt.storyP3Bold')}</span>
            {t('abt.storyP3Post')}
          </p>
        </div>
      </SettingsCard>

      {/* Card 3 — Logs */}
      {IS_ELECTRON && (
        <SettingsCard icon={FolderOpen} title={t('abt.logsTitle')} subtitle={t('abt.logsSubtitle')}>
          <Button
            variant="outline"
            size="sm"
            className="border-border/40"
            onClick={() => openLogsFolder.mutate()}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t('abt.openLogs')}
          </Button>
        </SettingsCard>
      )}
    </div>
  );
}
