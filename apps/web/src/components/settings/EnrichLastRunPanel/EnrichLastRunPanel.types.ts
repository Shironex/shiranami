import type { useTranslation } from 'react-i18next';
import type { EnrichLastRunEntry } from '@/stores/useMetadataEnrichStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IEnrichLastRunPanelView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `enrichDialog`-namespace translator for the per-field diff rows. */
  readonly tDialog: TranslateFn;
  /** Whether the panel renders (a finished run with results exists and none is in flight). */
  readonly visible: boolean;
  /** Whether the collapsible body is expanded. */
  readonly open: boolean;
  /** Toggle the collapsible body. */
  readonly onToggle: () => void;
  /** The last run's per-track result entries. */
  readonly entries: readonly EnrichLastRunEntry[];
  /** Number of entries that succeeded and produced at least one field change. */
  readonly changedCount: number;
}
