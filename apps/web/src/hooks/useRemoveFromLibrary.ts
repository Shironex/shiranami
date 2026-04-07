import { useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { queryClient } from '@/lib/queryClient';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

/**
 * Encapsulates the logic for removing tracks from the library and cleaning up queue state.
 * Used by both TrackContextMenu and BulkActionBar to avoid duplicating this complex logic.
 */
export function useRemoveFromLibrary() {
  const { t: tToast } = useTranslation('toast');
  const removeFromLibrary = usePlayerStore((s) => s.removeFromLibrary);

  const removeTracksFromQueue = useCallback((ids: string[]) => {
    const idsSet = new Set(ids);
    const { queue, queueIndex, currentTrack } = usePlayerStore.getState();
    const isCurrentlyPlaying = currentTrack != null && idsSet.has(currentTrack.id);

    const newQueue = queue.filter((t) => !idsSet.has(t.id));
    if (newQueue.length === queue.length) return; // nothing to remove from queue

    let newIndex = queueIndex;
    for (let i = 0; i < queueIndex && i < queue.length; i++) {
      if (idsSet.has(queue[i].id)) newIndex--;
    }

    if (isCurrentlyPlaying) {
      const nextTrack = newQueue[Math.min(newIndex, newQueue.length - 1)] ?? null;
      usePlayerStore.setState({
        queue: newQueue,
        queueIndex: nextTrack ? Math.min(newIndex, newQueue.length - 1) : -1,
        currentTrack: nextTrack,
        currentTime: 0,
        isPlaying: !!nextTrack,
      });
    } else {
      usePlayerStore.setState({
        queue: newQueue,
        queueIndex: Math.min(newIndex, Math.max(newQueue.length - 1, 0)),
      });
    }
  }, []);

  const removeFromDb = useCallback(async (ids: string[]) => {
    if (ids.length === 1) {
      await window.electronAPI.db.tracks.remove(ids[0]);
    } else {
      await window.electronAPI.db.tracks.removeMany(ids);
    }
  }, []);

  const handleRemoveFromLibrary = useCallback(async (ids: string[]) => {
    if (!IS_ELECTRON) return;
    try {
      await removeFromDb(ids);
      removeFromLibrary(ids);
      removeTracksFromQueue(ids);
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });
      toast.success(
        ids.length > 1
          ? tToast('removedTracksFromLibrary', { count: ids.length })
          : tToast('removedFromLibrary')
      );
    } catch {
      toast.error(tToast('failedRemoveTrack'));
    }
  }, [removeFromDb, removeFromLibrary, removeTracksFromQueue, tToast]);

  const handleDeleteFromDisk = useCallback(async (ids: string[], tracks: Track[]) => {
    if (!IS_ELECTRON) return;
    let filesMovedToTrash = 0;

    try {
      for (const t of tracks) {
        try {
          await window.electronAPI.shell.trashFile(t.filePath);
          filesMovedToTrash++;
        } catch {
          // continue with others
        }
      }

      if (filesMovedToTrash === 0) {
        toast.error(tToast('recycleFail'));
        return;
      }

      await removeFromDb(ids);
      removeFromLibrary(ids);
      removeTracksFromQueue(ids);
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: playlistKeys.all });

      toast.success(
        ids.length > 1
          ? tToast('movedTracksToRecycle', { count: filesMovedToTrash })
          : tToast('movedToRecycle')
      );
    } catch {
      toast.error(
        filesMovedToTrash > 0
          ? tToast('recyclePartialFail')
          : tToast('recycleFail')
      );
    }
  }, [removeFromDb, removeFromLibrary, removeTracksFromQueue, tToast]);

  return { handleRemoveFromLibrary, handleDeleteFromDisk };
}
