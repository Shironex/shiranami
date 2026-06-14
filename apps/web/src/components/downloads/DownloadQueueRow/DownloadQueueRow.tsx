import { Music, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DownloadProgressButton } from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
import { useDownloadQueueRow } from './DownloadQueueRow.hooks';
import type { IDownloadQueueRowProps } from './DownloadQueueRow.types';

export default function DownloadQueueRow({ item, onCancel }: IDownloadQueueRowProps) {
  const {
    showThumbnail,
    onThumbnailError,
    downloadStatus,
    statusLabel,
    statusClass,
    errorSuffix,
    buttonTitle,
    isActive,
    isCancellable,
    cancelTitle,
    cancelAriaLabel,
    progressAriaLabel,
  } = useDownloadQueueRow({ item, onCancel });

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors relative overflow-hidden',
        isActive ? 'bg-primary/[0.04]' : 'hover:bg-accent/40'
      )}
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center relative z-10">
        {showThumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
            onError={onThumbnailError}
          />
        ) : (
          <Music className="w-4 h-4 text-muted-foreground/40" />
        )}
      </div>

      <div className="flex-1 min-w-0 relative z-10">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <p className={cn('text-xs truncate mt-0.5 text-muted-foreground', statusClass)}>
          {statusLabel}
          {errorSuffix}
        </p>
      </div>

      <div className="shrink-0 relative z-10 flex items-center gap-1">
        <DownloadProgressButton
          status={downloadStatus}
          ariaLabel={statusLabel}
          title={buttonTitle}
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
            title={cancelTitle}
            aria-label={cancelAriaLabel}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {isActive && (
        <DownloadProgressBar
          progress={item.progress}
          className="rounded-b-xl"
          ariaLabel={progressAriaLabel}
        />
      )}
    </div>
  );
}
