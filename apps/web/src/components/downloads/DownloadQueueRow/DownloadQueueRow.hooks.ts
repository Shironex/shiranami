import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { DownloadStatus } from '@/components/shared/DownloadProgressButton';
import type { DownloadQueueStatus } from '@shiranami/contracts';
import type { IDownloadQueueRowProps, IDownloadQueueRowView } from './DownloadQueueRow.types';

/** Map the queue lifecycle status onto the shared download-button status. */
function toDownloadStatus(status: DownloadQueueStatus): DownloadStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'active':
      return 'downloading';
    case 'converting':
      return 'converting';
    case 'done':
      return 'done';
    case 'canceled':
      return 'canceled';
    case 'error':
      return 'error';
  }
}

export function useDownloadQueueRow({ item }: IDownloadQueueRowProps): IDownloadQueueRowView {
  const { t } = useTranslation('downloads');
  // Fall back to the Music icon if the thumbnail URL is broken/unreachable.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const isActive = item.status === 'active' || item.status === 'converting';
  const isCancellable = isActive || item.status === 'queued';
  const statusLabel = t(`status.${item.status}`);

  const statusClass = cn(
    item.status === 'done' && 'text-success/80',
    item.status === 'error' && 'text-destructive/80',
    item.status === 'canceled' && 'text-muted-foreground/60',
    isActive && 'text-primary/70',
    item.status === 'queued' && 'text-muted-foreground/60'
  );

  const showThumbnail = Boolean(item.thumbnail) && !thumbnailFailed;
  const errorSuffix = item.status === 'error' && item.error ? `: ${item.error}` : '';

  return {
    showThumbnail,
    onThumbnailError: () => setThumbnailFailed(true),
    downloadStatus: toDownloadStatus(item.status),
    statusLabel,
    statusClass,
    errorSuffix,
    buttonTitle: item.status === 'error' ? item.error : undefined,
    isActive,
    isCancellable,
    cancelTitle: t('action.cancel'),
    cancelAriaLabel: t('a11y.cancelDownload', { title: item.title }),
    progressAriaLabel: t('a11y.progress', { title: item.title }),
  };
}
