import { RefreshCcw, Loader2, Download, Check, ExternalLink } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUpdatesSection } from './UpdatesSection.hooks';

export default function UpdatesSection() {
  const {
    t,
    isMac,
    version,
    progress,
    statusMessage,
    isCheckDisabled,
    isUpdateAvailable,
    isUpdateReady,
    showChangelogLink,
    isError,
    isDownloading,
    onCheckForUpdates,
    onDownloadUpdate,
    onInstallUpdate,
  } = useUpdatesSection();

  return (
    <SettingsCard
      icon={RefreshCcw}
      title={t('upd.title')}
      subtitle={isMac ? t('upd.subtitleMac') : t('upd.subtitleWin')}
    >
      {isMac ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('upd.macNotice')}</p>
          <a
            href="https://github.com/Shironex/shiranami/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('upd.openGithub')}
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCheckForUpdates}
              disabled={isCheckDisabled}
              className="gap-1.5 rounded-lg [&_svg]:size-3.5"
            >
              {isCheckDisabled ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
              {t('upd.check')}
            </Button>

            {isUpdateAvailable && (
              <Button
                size="sm"
                onClick={onDownloadUpdate}
                className="gap-1.5 rounded-lg [&_svg]:size-3.5"
              >
                <Download />
                {t('upd.downloadVersion', { version })}
              </Button>
            )}

            {isUpdateReady && (
              <Button
                size="sm"
                onClick={onInstallUpdate}
                className="gap-1.5 rounded-lg [&_svg]:size-3.5"
              >
                <Check />
                {t('upd.installRestart')}
              </Button>
            )}

            {showChangelogLink && (
              <a
                href="https://shiranami.app/changelog"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('upd.viewChangelog')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <p className={cn('text-xs', isError ? 'text-red-400' : 'text-muted-foreground')}>
            {statusMessage}
          </p>

          {isDownloading && (
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
