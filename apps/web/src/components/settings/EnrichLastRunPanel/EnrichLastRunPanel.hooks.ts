import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import type { IEnrichLastRunPanelView } from './EnrichLastRunPanel.types';

/**
 * In-memory post-run report state for the bulk enrichment feature. Subscribes
 * only to `lastRunResults` (and `isEnriching` to stay hidden during a run), so
 * it does not re-render on per-track progress ticks. No DB reads — purely a
 * view over the snapshot the store collected when the run finished.
 */
export function useEnrichLastRunPanel(): IEnrichLastRunPanelView {
  const { t } = useTranslation('settings');
  const { t: tDialog } = useTranslation('enrichDialog');
  const lastRunResults = useMetadataEnrichStore(s => s.lastRunResults);
  const isEnriching = useMetadataEnrichStore(s => s.isEnriching);
  const [open, setOpen] = useState(false);

  const onToggle = useCallback(() => setOpen(o => !o), []);

  const visible = !isEnriching && lastRunResults.length > 0;
  const changedCount = lastRunResults.filter(r => r.success && r.diffs.length > 0).length;

  return { t, tDialog, visible, open, onToggle, entries: lastRunResults, changedCount };
}
