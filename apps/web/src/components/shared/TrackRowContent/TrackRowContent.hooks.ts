import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import type { ContextMenuPosition } from '@/components/shared/TrackContextMenu';
import type { ITrackRowContentProps, ITrackRowContentView } from './TrackRowContent.types';

export function useTrackRowContent({
  track,
  index,
  queue,
  currentTrack,
  handlePlayTrack,
}: ITrackRowContentProps): ITrackRowContentView {
  const { t } = useTranslation('contextMenu');
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const isSelected = useSelectionStore(s => s.selectedTrackIds.has(track.id));
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const toggleTrack = useSelectionStore(s => s.toggleTrack);
  const selectRange = useSelectionStore(s => s.selectRange);
  const clearSelection = useSelectionStore(s => s.clearSelection);

  // Heart icon subscribes to *this row's* overlay favorite value only — a
  // toggle anywhere in the app (player bar, context menu, this row) updates
  // the overlay store, and Zustand's Object.is comparison re-renders just the
  // toggled row instead of every mounted virtual row. Falls back to the seed
  // value on the passed-in `track` when no overlay entry exists.
  const overlayFavorite = useTrackOverlayStore(s => s.overlays.get(track.id)?.isFavorite);
  const isFavorite = overlayFavorite ?? track.isFavorite ?? false;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Read the live Set via getState() instead of subscribing to it — the
      // row only cares whether *it* is in the current selection at click time.
      if (hasSelection && !useSelectionStore.getState().selectedTrackIds.has(track.id)) {
        clearSelection();
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [hasSelection, track.id, clearSelection]
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (isMod) {
        e.preventDefault();
        toggleTrack(track.id, index);
        return;
      }
      if (isShift) {
        e.preventDefault();
        selectRange(index, queue);
        return;
      }
      if (hasSelection) {
        clearSelection();
      }
      handlePlayTrack(index);
    },
    [
      track.id,
      index,
      queue,
      hasSelection,
      toggleTrack,
      selectRange,
      clearSelection,
      handlePlayTrack,
    ]
  );

  const isActive = currentTrack?.id === track.id;

  return {
    t,
    contextMenu,
    isSelected,
    isActive,
    isFavorite,
    handleContextMenu,
    handleCloseContextMenu,
    handleClick,
  };
}
