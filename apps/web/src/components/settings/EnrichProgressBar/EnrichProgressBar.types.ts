import type { useTranslation } from 'react-i18next';
import type { EnrichProgress } from '@shiranami/contracts';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IEnrichProgressBarView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the progress panel renders (a run is active and progress exists). */
  readonly visible: boolean;
  /** The current per-track progress event, or null when there is none. */
  readonly progress: EnrichProgress | null;
  /** Completion as a clamped 0–100 percentage for the bar width. */
  readonly progressPercent: number;
  /** Whether a cancellation is in flight (shows the cancelling note). */
  readonly isCancelling: boolean;
}
