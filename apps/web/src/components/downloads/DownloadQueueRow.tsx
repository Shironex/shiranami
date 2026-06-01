import { useTranslation } from 'react-i18next';
import { Music, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DownloadProgressButton,
  type DownloadStatus,
} from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
import type { DownloadQueueItem, DownloadQueueStatus } from '@shiranami/contracts';

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

interface DownloadQueueRowProps {
  item: DownloadQueueItem;
  onCancel: (id: string) => void;
}

export function DownloadQueueRow({ item, onCancel }: DownloadQueueRowProps) {
  const { t } = useTranslation('downloads');

  const isActive = item.status === 'active' || item.status === 'converting';
  const isCancellable = isActive || item.status === 'queued';
  const statusLabel = t(`status.${item.status}`);

  const statusClass = cn(
    item.status === 'done' && 'text-emerald-400/80',
    item.status === 'error' && 'text-destructive/80',
    item.status === 'canceled' && 'text-muted-foreground/60',
    isActive && 'text-primary/70',
    item.status === 'queued' && 'text-muted-foreground/60'
  );

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors relative overflow-hidden',
        isActive ? 'bg-primary/[0.04]' : 'hover:bg-accent/40'
      )}
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center relative z-10">
        <Music className="w-4 h-4 text-muted-foreground/40" />
      </div>

      <div className="flex-1 min-w-0 relative z-10">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <p className={cn('text-xs truncate mt-0.5 text-muted-foreground', statusClass)}>
          {statusLabel}
          {item.status === 'error' && item.error ? `: ${item.error}` : ''}
        </p>
      </div>

      <div className="shrink-0 relative z-10 flex items-center gap-1">
        <DownloadProgressButton
          status={toDownloadStatus(item.status)}
          ariaLabel={statusLabel}
          title={item.status === 'error' ? item.error : undefined}
          // The status glyph is presentational here — cancellation is the
          // dedicated X button. Force-disable so terminal rows (error/canceled)
          // don't render a clickable-looking no-op.
          disabled
          onDownload={() => {}}
        />
        {isCancellable && (
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-border/20 text-muted-foreground/60 transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={t('action.cancel')}
            aria-label={t('a11y.cancelDownload', { title: item.title })}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {isActive && (
        <DownloadProgressBar
          progress={item.progress}
          className="rounded-b-xl"
          ariaLabel={t('a11y.progress', { title: item.title })}
        />
      )}
    </div>
  );
}
