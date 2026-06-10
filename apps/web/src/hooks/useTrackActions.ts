import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { Track } from '@/stores/types';

interface TrackActionsOptions {
  /** Run after each action clears the selection (the context menu's onClose). */
  onComplete?: () => void;
  /**
   * Always use the plural `{ count }` toast strings, even for a single track.
   * The BulkActionBar is conceptually a bulk surface and showed plural wording
   * before this hook existed, so it opts in to keep that exact behavior; the
   * context menu leaves this off and picks singular/plural by count.
   */
  alwaysPlural?: boolean;
}

/**
 * Shared multi-track operations used by both the right-click TrackContextMenu
 * and the BulkActionBar. Each handler runs the operation over the supplied
 * tracks/ids, clears the current selection, then invokes the optional
 * `onComplete` callback (the context menu passes its `onClose` here; the bulk
 * bar passes nothing).
 *
 * Toast wording is chosen by count — a single target gets the singular string,
 * more than one gets the `{ count }` plural — which matches the context menu's
 * prior behavior (its `isBulk` was true exactly when count > 1). The bulk bar
 * passes `alwaysPlural` to keep its plural-only wording.
 */
export function useTrackActions(options: TrackActionsOptions = {}) {
  const { onComplete, alwaysPlural = false } = options;
  const { t: tToast } = useTranslation('toast');
  const addToQueue = usePlaybackStore(s => s.addToQueue);
  const playNext = usePlaybackStore(s => s.playNext);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const clearSelection = useSelectionStore(s => s.clearSelection);

  const handlePlayNext = useCallback(
    (tracks: Track[]) => {
      for (const t of tracks) {
        playNext(t);
      }
      toast.success(
        alwaysPlural || tracks.length > 1
          ? tToast('tracksPlayNext', { count: tracks.length })
          : tToast('trackPlayNext')
      );
      clearSelection();
      onComplete?.();
    },
    [playNext, tToast, clearSelection, onComplete, alwaysPlural]
  );

  const handleAddToQueue = useCallback(
    (tracks: Track[]) => {
      addToQueue(tracks);
      toast.success(
        alwaysPlural || tracks.length > 1
          ? tToast('addedTracksToQueue', { count: tracks.length })
          : tToast('addedToQueue')
      );
      clearSelection();
      onComplete?.();
    },
    [addToQueue, tToast, clearSelection, onComplete, alwaysPlural]
  );

  const handleToggleFavorite = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        toggleFavorite(id);
      }
      clearSelection();
      onComplete?.();
    },
    [toggleFavorite, clearSelection, onComplete]
  );

  return { handlePlayNext, handleAddToQueue, handleToggleFavorite };
}
