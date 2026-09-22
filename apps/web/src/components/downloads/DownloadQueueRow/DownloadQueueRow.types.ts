import type { DownloadQueueItem } from '@shiranami/contracts';
import type { DownloadStatus } from '@/components/shared/DownloadProgressButton';

export interface IDownloadQueueRowProps {
  readonly item: DownloadQueueItem;
  readonly onCancel: (id: string) => void;
  /** Retry a failed download. Absent when the runtime has no retry support. */
  readonly onRetry?: (id: string) => void;
}

export interface IDownloadQueueRowView {
  /** Render the artwork thumbnail (a URL is known and hasn't errored); else the Music icon. */
  readonly showThumbnail: boolean;
  /** Marks the thumbnail as failed so the fallback icon renders. */
  readonly onThumbnailError: () => void;
  /** Mapped status for the shared download-status glyph button. */
  readonly downloadStatus: DownloadStatus;
  /** Localized status label for the row + aria-label. */
  readonly statusLabel: string;
  /** Tailwind class for the status text color, derived from the lifecycle status. */
  readonly statusClass: string;
  /** Trailing ": <error>" appended to the status line when the download failed. */
  readonly errorSuffix: string;
  /** Tooltip for the status glyph button — the raw error message on failure. */
  readonly buttonTitle: string | undefined;
  /** Active or converting — drives the highlighted row background + progress bar. */
  readonly isActive: boolean;
  /** Active, converting, or queued — the row can be cancelled. */
  readonly isCancellable: boolean;
  /** Failed, and the runtime supports retrying — the row shows a retry button. */
  readonly isRetryable: boolean;
  /** Tooltip for the cancel button. */
  readonly cancelTitle: string;
  /** Accessible label for the cancel button. */
  readonly cancelAriaLabel: string;
  /** Tooltip for the retry button. */
  readonly retryTitle: string;
  /** Accessible label for the retry button. */
  readonly retryAriaLabel: string;
  /** Accessible label for the determinate progress bar. */
  readonly progressAriaLabel: string;
}
