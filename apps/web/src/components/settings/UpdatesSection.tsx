import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '@/components/settings/SettingsCard';
import {
  RefreshCcw,
  Loader2,
  Download,
  Check,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

function updateStatusMessage(
  status: UpdateStatus,
  ctx: {
    version: string | null;
    progress: number;
    error: string | null;
  },
  t: (key: string, opts?: Record<string, unknown>) => string,
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
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isMac = IS_ELECTRON && window.electronAPI.platform === 'darwin';

  // Updater listeners
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const updater = window.electronAPI.updater;
    const unsubs = [
      updater.onCheckingForUpdate(() => {
        setUpdateStatus('checking');
        setUpdateError(null);
      }),
      updater.onUpdateAvailable((info) => {
        setUpdateStatus('available');
        setUpdateVersion(info.version);
        setUpdateError(null);
      }),
      updater.onUpdateNotAvailable(() => {
        setUpdateStatus('idle');
        setUpdateError(null);
      }),
      updater.onDownloadProgress((progress) => {
        setUpdateStatus('downloading');
        setUpdateProgress(Math.round(progress.percent));
      }),
      updater.onUpdateDownloaded((info) => {
        setUpdateStatus('ready');
        setUpdateVersion(info.version);
      }),
      updater.onUpdateError((message) => {
        if (message === 'RELEASE_PENDING') {
          setUpdateStatus('idle');
          setUpdateError(null);
        } else {
          setUpdateStatus('error');
          setUpdateError(message);
        }
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const result = await window.electronAPI.updater.checkForUpdates();
      if (!result.enabled) {
        setUpdateStatus('idle');
      }
    } catch {
      setUpdateStatus('error');
      setUpdateError(t('upd.checkFailed'));
    }
  }, [t]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setUpdateStatus('downloading');
    setUpdateProgress(0);
    try {
      await window.electronAPI.updater.startDownload();
    } catch {
      setUpdateStatus('error');
      setUpdateError(t('upd.downloadFailed'));
    }
  }, [t]);

  const handleInstallUpdate = useCallback(async () => {
    if (!IS_ELECTRON) return;
    await window.electronAPI.updater.installNow();
  }, []);

  return (
    <SettingsCard
      icon={RefreshCcw}
      title={t('upd.title')}
      subtitle={isMac ? t('upd.subtitleMac') : t('upd.subtitleWin')}
    >
      {isMac ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('upd.macNotice')}
          </p>
          <a
            href="https://github.com/Shironex/shiranami/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('upd.openGithub')}
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckForUpdates}
              disabled={
                updateStatus === 'checking' || updateStatus === 'downloading'
              }
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateStatus === 'checking' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5" />
              )}
              {t('upd.check')}
            </button>

            {updateStatus === 'available' && (
              <button
                onClick={handleDownloadUpdate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t('upd.downloadVersion', { version: updateVersion })}
              </button>
            )}

            {updateStatus === 'ready' && (
              <button
                onClick={handleInstallUpdate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {t('upd.installRestart')}
              </button>
            )}

            {(updateStatus === 'available' || updateStatus === 'ready') && (
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
            className={cn(
              'text-xs',
              updateStatus === 'error' ? 'text-red-400' : 'text-muted-foreground',
            )}
          >
            {updateStatusMessage(updateStatus, {
              version: updateVersion,
              progress: updateProgress,
              error: updateError,
            }, t)}
          </p>

          {updateStatus === 'downloading' && (
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${updateProgress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
