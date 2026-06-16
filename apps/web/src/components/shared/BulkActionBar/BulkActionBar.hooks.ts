import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useRemoveFromLibrary } from '@/hooks/useRemoveFromLibrary';
import { useTrackActions } from '@/hooks/useTrackActions';
import type { IBulkActionBarProps, IBulkActionBarView } from './BulkActionBar.types';

export function useBulkActionBar({
  trackList,
  onRemoveFromPlaylist,
}: IBulkActionBarProps): IBulkActionBarView {
  const { t } = useTranslation('contextMenu');
  const { t: tCommon } = useTranslation('common');

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const selectAll = useSelectionStore(s => s.selectAll);
  const count = selectedTrackIds.size;

  const library = useLibraryStore(s => s.library);

  const { handleRemoveFromLibrary, handleDeleteFromDisk } = useRemoveFromLibrary();
  // The bar is conceptually a bulk surface, so keep its plural-only toast wording
  // even when a single track happens to be selected.
  const trackActions = useTrackActions({ alwaysPlural: true });

  // Prefer the canonical library entries; fall back to the passed list for views
  // (e.g. playlists) whose rows aren't in the global library.
  const selectedTracks = library.filter(t => selectedTrackIds.has(t.id));
  const resolvedTracks =
    selectedTracks.length > 0 ? selectedTracks : trackList.filter(t => selectedTrackIds.has(t.id));
  const ids = Array.from(selectedTrackIds);

  const allSelected = count === trackList.length;

  const onRemoveFromLibrary = async () => {
    await handleRemoveFromLibrary(ids);
    clearSelection();
  };

  const onDeleteFromDisk = async () => {
    await handleDeleteFromDisk(ids, resolvedTracks);
    clearSelection();
  };

  const onRemoveFromPlaylistClick = () => {
    if (!onRemoveFromPlaylist) return;
    onRemoveFromPlaylist(ids);
    clearSelection();
  };

  const onToggleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll(trackList);
    }
  };

  return {
    t,
    tCommon,
    isVisible: count > 0,
    count,
    allSelected,
    hasRemoveFromPlaylist: Boolean(onRemoveFromPlaylist),
    onPlayNext: () => trackActions.handlePlayNext(resolvedTracks),
    onAddToQueue: () => trackActions.handleAddToQueue(resolvedTracks),
    onToggleFavorite: () => trackActions.handleToggleFavorite(ids),
    onToggleSelectAll,
    onRemoveFromPlaylist: onRemoveFromPlaylistClick,
    onRemoveFromLibrary,
    onDeleteFromDisk,
    onClearSelection: clearSelection,
  };
}
