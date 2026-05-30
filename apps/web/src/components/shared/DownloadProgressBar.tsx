import { cn } from '@/lib/utils';

interface DownloadProgressBarProps {
  /**
   * When a 0–100 value is provided the bar renders DETERMINATE (fills to the
   * percentage, exposes `role="progressbar"` + aria values). When omitted it
   * renders the INDETERMINATE sweep used where no real percentage exists
   * (recommendations/discover). The `.progress-sweep` animation is gated for
   * reduced-motion / low-perf in globals.css.
   */
  progress?: number;
  /** Bottom-corner radius to match the host card (e.g. `rounded-b-2xl`). */
  className?: string;
  /** Accessible name for the determinate progressbar. */
  ariaLabel?: string;
}

/**
 * The bottom-edge download progress bar extracted from the recommendations
 * shelf. Same visual language at every call site: a 3px bar pinned to the
 * bottom of the row, primary tint. Indeterminate sweep when no percentage is
 * known; determinate fill when one is.
 */
export function DownloadProgressBar({ progress, className, ariaLabel }: DownloadProgressBarProps) {
  const isDeterminate = typeof progress === 'number' && !Number.isNaN(progress);

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

  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <span
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden',
        className
      )}
      role="progressbar"
      aria-label={ariaLabel}
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
