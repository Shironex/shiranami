import { AlertCircle, Check, Clock, Download, Loader2, X } from 'lucide-react';
import type {
  IDownloadProgressButtonProps,
  IDownloadProgressButtonView,
} from './DownloadProgressButton.types';

/**
 * Drives the {@link DownloadProgressButton} state machine: idle (download
 * icon) → downloading/converting (spinning loader) → done (emerald check) →
 * error (destructive alert). Presentational-only — the owning feature hook
 * supplies `status`; this resolves the glyph component + color/border classes
 * and the derived `disabled`/`busy` flags so the shell stays a thin renderer.
 */
export function useDownloadProgressButton({
  status,
  disabled = false,
}: IDownloadProgressButtonProps): IDownloadProgressButtonView {
  const isBusy = status === 'downloading' || status === 'converting';
  const isDisabled =
    disabled ||
    isBusy ||
    status === 'queued' ||
    status === 'done' ||
    status === 'skipped' ||
    status === 'canceled';

  if (status === 'queued') {
    // Waiting for a concurrency slot: a muted clock, visually distinct from the
    // active spinner so "waiting vs downloading" is legible at a glance.
    return {
      Icon: Clock,
      spin: false,
      colorClass: 'text-muted-foreground/50',
      borderClass: 'border-border/15',
      isDisabled,
      isBusy,
    };
  }
  if (isBusy) {
    return {
      Icon: Loader2,
      spin: true,
      colorClass: 'text-primary/80',
      borderClass: 'border-primary/20',
      isDisabled,
      isBusy,
    };
  }
  if (status === 'done') {
    return {
      Icon: Check,
      spin: false,
      colorClass: 'text-success/90',
      borderClass: 'border-success/15 motion-safe:transition-colors motion-safe:duration-200',
      isDisabled,
      isBusy,
    };
  }
  if (status === 'skipped') {
    return {
      Icon: Check,
      spin: false,
      colorClass: 'text-muted-foreground/50',
      borderClass: 'border-border/15',
      isDisabled,
      isBusy,
    };
  }
  if (status === 'canceled') {
    // Cancel is intentionally distinct from failure — render it neutral, not
    // with the destructive error glyph.
    return {
      Icon: X,
      spin: false,
      colorClass: 'text-muted-foreground/50',
      borderClass: 'border-border/15',
      isDisabled,
      isBusy,
    };
  }
  if (status === 'error') {
    return {
      Icon: AlertCircle,
      spin: false,
      colorClass: 'text-destructive',
      borderClass: 'border-destructive/20',
      isDisabled,
      isBusy,
    };
  }
  if (disabled) {
    // Force-disabled idle (e.g. a waiting playlist row during a batch import):
    // mute it so it reads as inert rather than a clickable affordance.
    return {
      Icon: Download,
      spin: false,
      colorClass: 'text-muted-foreground/30',
      borderClass: 'border-border/10',
      isDisabled,
      isBusy,
    };
  }
  return {
    Icon: Download,
    spin: false,
    colorClass: 'text-primary/80',
    borderClass: 'border-border/20',
    isDisabled,
    isBusy,
  };
}
