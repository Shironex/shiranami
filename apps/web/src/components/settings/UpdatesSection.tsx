import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { RefreshCcw, Loader2, Download, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useUpdaterEvents,
  useCheckForUpdatesMutation,
  useStartUpdateDownloadMutation,
  useInstallUpdateMutation,
  type UpdateStatus,
} from '@/hooks/useUpdater';

function updateStatusMessage(
  status: UpdateStatus,
  ctx: {
    version: string | null;
    progress: number;
    error: string | null;
  },
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  switch (status) {
    case 'idle':
      return t('upd.noUpdates');
    case 'checking':
      return t('upd.checking');
    case 'available':
      return ctx.version != null
        ? t('upd.available', { version: ctx.version })
        : t('upd.available', { version: '' });
    case 'downloading':
      return t('upd.downloading', { percent: ctx.progress });
    case 'ready':
      return t('upd.ready');
    case 'error':
      return ctx.error ?? t('upd.somethingWrong');
  }
}

export function UpdatesSection() {
  const { t } = useTranslation('settings');
  const { status, version, progress, error, isMac, setStatus, setProgress, setError } =
    useUpdaterEvents();

  const checkMutation = useCheckForUpdatesMutation();
  const downloadMutation = useStartUpdateDownloadMutation();
  const installMutation = useInstallUpdateMutation();

  const handleCheckForUpdates = useCallback(async () => {
    setStatus('checking');
    setError(null);
    try {
      const result = await checkMutation.mutateAsync();
      if (!result?.enabled) {
        setStatus('idle');
      }
    } catch {
      setStatus('error');
      setError(t('upd.checkFailed'));
    }
  }, [checkMutation, setStatus, setError, t]);

  const handleDownloadUpdate = useCallback(async () => {
    setStatus('downloading');
    setProgress(0);
    try {
      await downloadMutation.mutateAsync();
    } catch {
      setStatus('error');
      setError(t('upd.downloadFailed'));
    }
  }, [downloadMutation, setStatus, setProgress, setError, t]);

  const handleInstallUpdate = useCallback(async () => {
    await installMutation.mutateAsync();
  }, [installMutation]);

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
            rel="noreferrer"
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
              onClick={handleCheckForUpdates}
              disabled={status === 'checking' || status === 'downloading'}
              className="gap-1.5 rounded-lg [&_svg]:size-3.5"
            >
              {status === 'checking' ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
              {t('upd.check')}
            </Button>

            {status === 'available' && (
              <Button
                size="sm"
                onClick={handleDownloadUpdate}
                className="gap-1.5 rounded-lg [&_svg]:size-3.5"
              >
                <Download />
                {t('upd.downloadVersion', { version })}
              </Button>
            )}

            {status === 'ready' && (
              <Button
                size="sm"
                onClick={handleInstallUpdate}
                className="gap-1.5 rounded-lg [&_svg]:size-3.5"
              >
                <Check />
                {t('upd.installRestart')}
              </Button>
            )}

            {(status === 'available' || status === 'ready') && (
              <a
                href="https://shiranami.app/changelog"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('upd.viewChangelog')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <p
            className={cn('text-xs', status === 'error' ? 'text-red-400' : 'text-muted-foreground')}
          >
            {updateStatusMessage(status, { version, progress, error }, t)}
          </p>

          {status === 'downloading' && (
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
