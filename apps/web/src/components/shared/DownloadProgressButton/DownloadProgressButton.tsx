import { cn } from '@/lib/utils';
import { useDownloadProgressButton } from './DownloadProgressButton.hooks';
import type { IDownloadProgressButtonProps } from './DownloadProgressButton.types';

/**
 * The polished download-button state machine extracted from the recommendations
 * shelf: idle (download icon) → downloading/converting (spinning loader) → done
 * (emerald check) → error (destructive alert). Presentational only — the owning
 * hook drives `status`; strings come in as props so the shared file stays
 * decoupled from any single i18n namespace.
 */
export default function DownloadProgressButton(props: IDownloadProgressButtonProps) {
  const { ariaLabel, title, onDownload, className } = props;
  const { Icon, spin, colorClass, borderClass, isDisabled, isBusy } =
    useDownloadProgressButton(props);

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onDownload}
      disabled={isDisabled}
      aria-label={ariaLabel}
      title={title}
      aria-busy={isBusy ? 'true' : undefined}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors enabled:hover:border-border/40 enabled:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100',
        borderClass,
        colorClass,
        className
      )}
    >
      <Icon className={cn('size-4', spin && 'animate-spin')} />
    </button>
  );
}
