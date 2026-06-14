import type { useTranslation } from 'react-i18next';
import type { DownloadQueueItem } from '@shiranami/contracts';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export type DownloadSectionKey = 'active' | 'queued' | 'completed';

export interface IDownloadSection {
  readonly key: DownloadSectionKey;
  readonly items: readonly DownloadQueueItem[];
}

export interface IDownloadsViewView {
  /** Bound `downloads` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Lifecycle-grouped sections, in render order: active, queued, completed. */
  readonly sections: readonly IDownloadSection[];
  /** Whether the queue is paused — toggles the Resume/Pause control + banner. */
  readonly paused: boolean;
  /** No items at all (shows the empty/loading frame). */
  readonly isEmpty: boolean;
  /** False until the first snapshot lands — holds a blank frame instead of the empty state. */
  readonly hydrated: boolean;
  /** There is in-flight or pending work to pause / cancel. */
  readonly hasPendingWork: boolean;
  /** There are completed/terminal items to clear. */
  readonly hasCompleted: boolean;
  /** Cancel-all confirmation popover open state. */
  readonly showCancelAllConfirm: boolean;
  /** Controls the cancel-all confirmation popover. */
  readonly setShowCancelAllConfirm: (open: boolean) => void;
  /** Cancel a single download by id (explicit user action — surfaces failures). */
  readonly onCancelItem: (id: string) => void;
  /** Clear all completed/terminal downloads. */
  readonly onClearCompleted: () => void;
  /** Pause the queue. */
  readonly onPauseQueue: () => void;
  /** Resume the queue. */
  readonly onResumeQueue: () => void;
  /** Confirm cancel-all: closes the popover and cancels the whole queue. */
  readonly onConfirmCancelAll: () => void;
}
