import type { useTranslation } from 'react-i18next';
import type { VolumeUsage } from '@shiranami/contracts';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IDiskUsageSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether any watched folder exists (gates the refresh button + empty state). */
  readonly hasFolders: boolean;
  /** Whether the loading spinner should show (folders or usage still loading). */
  readonly isLoading: boolean;
  /** Whether the usage query errored. */
  readonly isError: boolean;
  /** Whether a refresh is in flight (spins the refresh icon, disables it). */
  readonly isFetching: boolean;
  /** Per-volume usage rows to render (empty until data arrives). */
  readonly volumes: readonly VolumeUsage[];
  /** Re-run the disk-usage query. */
  readonly onRefresh: () => void;
}
