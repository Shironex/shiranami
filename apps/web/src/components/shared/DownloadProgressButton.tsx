import { AlertCircle, Check, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared download status used across every per-track download entry point
 * (recommendations / search / playlist-import). Call sites that only model a
 * subset (e.g. recommendations has no `converting`) simply never pass the
 * extra values. `idle` covers playlist-import's `pending`; map it at the call
 * site. `skipped` is rendered as a muted check (already-in-library).
 */
export type DownloadStatus = 'idle' | 'downloading' | 'converting' | 'done' | 'error' | 'skipped';

interface DownloadProgressButtonProps {
  status: DownloadStatus;
  /** Accessible label; varies per call site, so it's passed in. */
  ariaLabel: string;
  /**
   * Optional tooltip for sighted users (e.g. the raw error message on retry).
   * Kept separate from `ariaLabel` so screen readers get a clean, actionable
   * label instead of an unlocalized technical string.
   */
  title?: string;
  /** Fired on click for the idle/error (retry) states. */
  onDownload: () => void;
  /**
   * Force-disable the button beyond what `status` implies (e.g. an idle
   * playlist row while a batch import is already running).
   */
  disabled?: boolean;
  /** Extra classes for the button slot (e.g. width to match a row layout). */
  className?: string;
}

/**
 * The polished download-button state machine extracted from the recommendations
 * shelf: idle (download icon) → downloading/converting (spinning loader) → done
 * (emerald check) → error (destructive alert). Presentational only — the owning
 * hook drives `status`; strings come in as props so the shared file stays
 * decoupled from any single i18n namespace.
 */
export function DownloadProgressButton({
  status,
  ariaLabel,
  title,
  onDownload,
  disabled = false,
  className,
}: DownloadProgressButtonProps) {
  const isBusy = status === 'downloading' || status === 'converting';
  const isDisabled = disabled || isBusy || status === 'done' || status === 'skipped';

  let icon: React.ReactNode;
  let colorClass: string;
  let borderClass: string;

  if (isBusy) {
    icon = <Loader2 className="size-4 animate-spin" />;
    colorClass = 'text-primary/80';
    borderClass = 'border-primary/20';
  } else if (status === 'done') {
    icon = <Check className="size-4" />;
    colorClass = 'text-emerald-400/90';
    borderClass = 'border-emerald-400/15 motion-safe:transition-colors motion-safe:duration-200';
  } else if (status === 'skipped') {
    icon = <Check className="size-4" />;
    colorClass = 'text-muted-foreground/50';
    borderClass = 'border-border/15';
  } else if (status === 'error') {
    icon = <AlertCircle className="size-4" />;
    colorClass = 'text-destructive';
    borderClass = 'border-destructive/20';
  } else if (disabled) {
    // Force-disabled idle (e.g. a waiting playlist row during a batch import):
    // mute it so it reads as inert rather than a clickable affordance.
    icon = <Download className="size-4" />;
    colorClass = 'text-muted-foreground/30';
    borderClass = 'border-border/10';
  } else {
    icon = <Download className="size-4" />;
    colorClass = 'text-primary/80';
    borderClass = 'border-border/20';
  }

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
      {icon}
    </button>
  );
}
