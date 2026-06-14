import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import type { DownloadQueueItem } from '@shiranami/contracts';
import type { IDownloadSection, IDownloadsViewView } from './DownloadsView.types';

function cancel(id: string) {
  if (!IS_ELECTRON) return;
  // Explicit user action — surface failures instead of dropping them silently.
  window.electronAPI.downloader.cancelDownload(id).catch((err: unknown) => {
    logger.error('[downloads] cancel failed', err);
    toast.error(i18n.t('error.cancelFailed', { ns: 'downloads' }));
  });
}

function clearCompleted() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.clearCompletedDownloads().catch((err: unknown) => {
    logger.error('[downloads] clear completed failed', err);
    toast.error(i18n.t('error.clearFailed', { ns: 'downloads' }));
  });
}

function pauseQueue() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.pauseDownloadQueue().catch((err: unknown) => {
    logger.error('[downloads] pause failed', err);
    toast.error(i18n.t('error.pauseFailed', { ns: 'downloads' }));
  });
}

function resumeQueue() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.resumeDownloadQueue().catch((err: unknown) => {
    logger.error('[downloads] resume failed', err);
    toast.error(i18n.t('error.resumeFailed', { ns: 'downloads' }));
  });
}

function cancelAll() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.cancelAllDownloads().catch((err: unknown) => {
    logger.error('[downloads] cancel all failed', err);
    toast.error(i18n.t('error.cancelAllFailed', { ns: 'downloads' }));
  });
}

export function useDownloadsView(): IDownloadsViewView {
  const { t } = useTranslation('downloads');
  const items = useDownloadQueueStore(s => s.items);
  const paused = useDownloadQueueStore(s => s.paused);
  const hydrated = useDownloadQueueStore(s => s.hydrated);
  const [showCancelAllConfirm, setShowCancelAllConfirm] = useState(false);

  const sections = useMemo<IDownloadSection[]>(() => {
    const active: DownloadQueueItem[] = [];
    const queued: DownloadQueueItem[] = [];
    const completed: DownloadQueueItem[] = [];
    for (const item of items) {
      if (item.status === 'active' || item.status === 'converting') active.push(item);
      else if (item.status === 'queued') queued.push(item);
      else completed.push(item);
    }
    return [
      { key: 'active', items: active },
      { key: 'queued', items: queued },
      { key: 'completed', items: completed },
    ];
  }, [items]);

  const hasCompleted = sections.find(s => s.key === 'completed')!.items.length > 0;
  // There is in-flight or pending work to pause / cancel.
  const hasPendingWork =
    sections.find(s => s.key === 'active')!.items.length > 0 ||
    sections.find(s => s.key === 'queued')!.items.length > 0;

  return {
    t,
    sections,
    paused,
    isEmpty: items.length === 0,
    hydrated,
    hasPendingWork,
    hasCompleted,
    showCancelAllConfirm,
    setShowCancelAllConfirm,
    onCancelItem: cancel,
    onClearCompleted: clearCompleted,
    onPauseQueue: pauseQueue,
    onResumeQueue: resumeQueue,
    onConfirmCancelAll: () => {
      setShowCancelAllConfirm(false);
      cancelAll();
    },
  };
}
