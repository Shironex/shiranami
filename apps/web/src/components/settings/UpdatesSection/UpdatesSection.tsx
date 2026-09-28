import { RefreshCcw, Loader2, Download, Check, ExternalLink } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUpdatesSection } from './UpdatesSection.hooks';

export default function UpdatesSection() {
  const {
    t,
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
    <SettingsCard icon={RefreshCcw} title={t('upd.title')} subtitle={t('upd.subtitle')}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCheckForUpdates}
            disabled={isCheckDisabled}
            className="gap-1.5 [&_svg]:size-3.5"
          >
            {isCheckDisabled ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
            {t('upd.check')}
          </Button>

          {isUpdateAvailable && (
            <Button size="sm" onClick={onDownloadUpdate} className="gap-1.5 [&_svg]:size-3.5">
              <Download />
              {t('upd.downloadVersion', { version })}
            </Button>
          )}

          {isUpdateReady && (
            <Button size="sm" onClick={onInstallUpdate} className="gap-1.5 [&_svg]:size-3.5">
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

        <p className={cn('text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
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
    </SettingsCard>
  );
}
