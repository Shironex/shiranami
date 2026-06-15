import { Trans } from 'react-i18next';
import { Globe, BookOpen, FolderOpen, Music2, Sparkles } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { useAboutSection } from './AboutSection.hooks';

export default function AboutSection() {
  const { t, versionLabel, showLogsCard, onOpenLogs, onReplayOnboarding } = useAboutSection();

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
        v{versionLabel}
      </span>
      <span className="text-[11.5px] text-muted-foreground">
        {'白波 · '}
        {t('abt.tagline')}
      </span>
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Card 1: Hero */}
      <SettingsCard iconSlot={heroIcon} title="Shiranami" subtitle={heroSubtitle}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="border-border/40" asChild>
            <a
              href="https://github.com/Shironex/shiranami"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Globe className="w-3.5 h-3.5" />
              {t('abt.github')}
            </a>
          </Button>
          <Button variant="outline" size="sm" className="border-border/40" asChild>
            <a
              href="https://github.com/Shironex/shiranami/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {t('abt.changelog')}
            </a>
          </Button>
        </div>
      </SettingsCard>

      {/* Card 2: Story */}
      <SettingsCard icon={Music2} title={t('abt.storyTitle')} subtitle={t('abt.storySubtitle')}>
        <div className="space-y-2.5 text-[13px] leading-[1.7] text-foreground/85">
          <p>
            <Trans
              t={t}
              i18nKey="abt.storyP1"
              components={{ 1: <span className="text-primary font-medium" /> }}
            />
          </p>
          <p>
            <Trans
              t={t}
              i18nKey="abt.storyP2"
              components={{ 1: <span className="text-primary font-medium" /> }}
            />
          </p>
          <p>
            <Trans
              t={t}
              i18nKey="abt.storyP3"
              components={{ 1: <span className="text-primary font-medium" /> }}
            />
          </p>
        </div>
      </SettingsCard>

      {/* Card 3: Logs */}
      {showLogsCard && (
        <SettingsCard icon={FolderOpen} title={t('abt.logsTitle')} subtitle={t('abt.logsSubtitle')}>
          <Button variant="outline" size="sm" className="border-border/40" onClick={onOpenLogs}>
            <FolderOpen className="w-3.5 h-3.5" />
            {t('abt.openLogs')}
          </Button>
        </SettingsCard>
      )}

      {/* Card 4: Replay onboarding */}
      <SettingsCard icon={Sparkles} title={t('abt.replayTitle')} subtitle={t('abt.replaySubtitle')}>
        <Button
          variant="outline"
          size="sm"
          className="border-border/40"
          onClick={onReplayOnboarding}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {t('abt.replayButton')}
        </Button>
      </SettingsCard>
    </div>
  );
}
