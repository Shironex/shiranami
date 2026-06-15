import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useUpdaterEvents,
  useCheckForUpdatesMutation,
  useStartUpdateDownloadMutation,
  useInstallUpdateMutation,
  type UpdateStatus,
} from '@/hooks/useUpdater';
import type { IUpdatesSectionView } from './UpdatesSection.types';

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

export function useUpdatesSection(): IUpdatesSectionView {
  const { t } = useTranslation('settings');
  const { status, version, progress, error, isMac, setStatus, setProgress, setError } =
    useUpdaterEvents();

  const checkMutation = useCheckForUpdatesMutation();
  const downloadMutation = useStartUpdateDownloadMutation();
  const installMutation = useInstallUpdateMutation();

  const onCheckForUpdates = useCallback(async () => {
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

  const onDownloadUpdate = useCallback(async () => {
    setStatus('downloading');
    setProgress(0);
    try {
      await downloadMutation.mutateAsync();
    } catch {
      setStatus('error');
      setError(t('upd.downloadFailed'));
    }
  }, [downloadMutation, setStatus, setProgress, setError, t]);

  const onInstallUpdate = useCallback(async () => {
    try {
      await installMutation.mutateAsync();
    } catch {
      setStatus('error');
      setError(t('upd.installFailed'));
    }
  }, [installMutation, setStatus, setError, t]);

  return {
    t,
    isMac,
    status,
    version,
    progress,
    statusMessage: updateStatusMessage(status, { version, progress, error }, t),
    isCheckDisabled: status === 'checking' || status === 'downloading',
    isUpdateAvailable: status === 'available',
    isUpdateReady: status === 'ready',
    showChangelogLink: status === 'available' || status === 'ready',
    isError: status === 'error',
    isDownloading: status === 'downloading',
    onCheckForUpdates: () => void onCheckForUpdates(),
    onDownloadUpdate: () => void onDownloadUpdate(),
    onInstallUpdate: () => void onInstallUpdate(),
  };
}
