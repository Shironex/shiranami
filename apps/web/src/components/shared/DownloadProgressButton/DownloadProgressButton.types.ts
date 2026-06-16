import type { LucideIcon } from 'lucide-react';

/**
 * Shared download status used across every per-track download entry point
 * (recommendations / search / playlist-import). Call sites that only model a
 * subset (e.g. recommendations has no `converting`) simply never pass the
 * extra values. `idle` covers playlist-import's `pending`; map it at the call
 * site. `skipped` is rendered as a muted check (already-in-library).
 *
 * This stays a `type` alias (not an `I`-prefixed interface) because it's a
 * string-literal union; its NAME is part of the shared public API consumed via
 * the folder barrel by downloads / playlist-import / search / overview.
 */
export type DownloadStatus =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'converting'
  | 'done'
  | 'canceled'
  | 'error'
  | 'skipped';

export interface IDownloadProgressButtonProps {
  readonly status: DownloadStatus;
  /** Accessible label; varies per call site, so it's passed in. */
  readonly ariaLabel: string;
  /**
   * Optional tooltip for sighted users (e.g. the raw error message on retry).
   * Kept separate from `ariaLabel` so screen readers get a clean, actionable
   * label instead of an unlocalized technical string.
   */
  readonly title?: string;
  /** Fired on click for the idle/error (retry) states. */
  readonly onDownload: () => void;
  /**
   * Force-disable the button beyond what `status` implies (e.g. an idle
   * playlist row while a batch import is already running).
   */
  readonly disabled?: boolean;
  /** Extra classes for the button slot (e.g. width to match a row layout). */
  readonly className?: string;
}

export interface IDownloadProgressButtonView {
  /** The status glyph component to render inside the button. */
  readonly Icon: LucideIcon;
  /** Whether the glyph spins (downloading/converting loader). */
  readonly spin: boolean;
  /** Tailwind text-color class derived from the status. */
  readonly colorClass: string;
  /** Tailwind border class derived from the status. */
  readonly borderClass: string;
  /** Whether the button is non-interactive for the current status/props. */
  readonly isDisabled: boolean;
  /** Whether a download/convert is in flight — drives `aria-busy`. */
  readonly isBusy: boolean;
}
