import { useTranslation } from 'react-i18next';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type {
  IImportBulkActionBarProps,
  IImportBulkActionBarView,
} from './ImportBulkActionBar.types';

export function useImportBulkActionBar({
  tracks,
  isImporting,
  onDownloadSelected,
  onRemoveSelected,
}: IImportBulkActionBarProps): IImportBulkActionBarView {
  const { t } = useTranslation('import');
  const { t: tCommon } = useTranslation('common');

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const selectAll = useSelectionStore(s => s.selectAll);
  const count = selectedTrackIds.size;

  const pendingSelectedCount = tracks.filter(
    track => selectedTrackIds.has(track.id) && track.status === 'pending'
  ).length;
  const allSelected = count === tracks.length;
  const selectToggleLabel = allSelected ? tCommon('clearSelection') : tCommon('selectAll');

  return {
    isHidden: count === 0,
    count,
    allSelected,
    pendingSelectedCount,
    canDownload: pendingSelectedCount > 0 && !isImporting,
    canRemove: !isImporting,
    toolbarLabel: tCommon('bulkActionsLabel'),
    selectedLabel: tCommon('selectedTracks', { count }),
    selectToggleLabel,
    downloadLabel: t('downloadSelected', { count: pendingSelectedCount }),
    removeLabel: t('removeSelected'),
    clearLabel: tCommon('clearSelection'),
    onToggleSelectAll: () => (allSelected ? clearSelection() : selectAll(tracks)),
    onDownload: () => {
      onDownloadSelected(new Set(selectedTrackIds));
      clearSelection();
    },
    onRemove: () => {
      onRemoveSelected(new Set(selectedTrackIds));
      clearSelection();
    },
    onClear: clearSelection,
  };
}
