import { cn } from '@/lib/utils';
import { useDownloadProgressBar } from './DownloadProgressBar.hooks';
import type { DownloadProgressBarProps } from './DownloadProgressBar.types';

/**
 * The bottom-edge download progress bar extracted from the recommendations
 * shelf. Same visual language at every call site: a 3px bar pinned to the
 * bottom of the row, primary tint. Indeterminate sweep when no percentage is
 * known; determinate fill when one is.
 */
export default function DownloadProgressBar(props: DownloadProgressBarProps) {
  const { className } = props;
  const { isDeterminate, clamped } = useDownloadProgressBar(props);

  if (!isDeterminate) {
    return (
      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden',
          className
        )}
        aria-hidden="true"
      >
        <span className="progress-sweep block h-full w-1/3 rounded-full bg-primary/60" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden',
        className
      )}
      role="progressbar"
      aria-label={props.ariaLabel}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="block h-full rounded-full bg-primary/60 transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
