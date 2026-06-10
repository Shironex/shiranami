import { clamp } from '@shiranami/shared';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  /** Completion percentage, 0–100. Clamped for the fill width + aria value. */
  value: number;
  /** Classes for the outer track. Defaults to a 2px muted rounded track. */
  className?: string;
  /** Extra classes merged onto the inner fill. */
  fillClassName?: string;
  /** Accessible label for the progress bar. */
  'aria-label'?: string;
}

/**
 * Determinate progress bar primitive with built-in `role="progressbar"` +
 * `aria-valuenow/min/max`. Replaces the hand-rolled track/fill `<div>` pairs
 * scattered across feature components; `InstallProgressBar` builds on it.
 */
export function ProgressBar({
  value,
  className,
  fillClassName,
  'aria-label': ariaLabel,
}: ProgressBarProps) {
  const clamped = clamp(value, 0, 100);
  return (
    <div
      className={cn('w-full h-2 rounded-full bg-muted overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={cn('h-full bg-primary rounded-full transition-all duration-300', fillClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
