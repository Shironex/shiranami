import { useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import type { Track } from '@/stores/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { withToast } from '@/hooks/useToastMutation';
import { queryClient } from '@/lib/queryClient';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

/**
 * Encapsulates the logic for removing tracks from the library and cleaning up queue state.
 * Used by both TrackContextMenu and BulkActionBar to avoid duplicating this complex logic.
 */
export function useRemoveFromLibrary() {
  const { t: tToast } = useTranslation('toast');
  const removeFromLibrary = useLibraryStore(s => s.removeFromLibrary);

  const removeFromDb = useCallback(async (ids: string[]) => {
    if (ids.length === 1) {
      await window.electronAPI.db.tracks.remove(ids[0]);
    } else {
      await window.electronAPI.db.tracks.removeMany(ids);
    }
  }, []);

  const handleRemoveFromLibrary = useCallback(
    async (ids: string[]) => {
      if (!IS_ELECTRON) return;
      await withToast({
        mutate: async () => {
          await removeFromDb(ids);
          removeFromLibrary(ids);
          queryClient.invalidateQueries({ queryKey: libraryKeys.all });
          queryClient.invalidateQueries({ queryKey: playlistKeys.all });
        },
        successMessage: () =>
          ids.length > 1
            ? tToast('removedTracksFromLibrary', { count: ids.length })
            : tToast('removedFromLibrary'),
        errorMessage: 'failedRemoveTrack',
        logLabel: 'Failed to remove tracks from library',
      });
    },
    [removeFromDb, removeFromLibrary, tToast]
  );

  const handleDeleteFromDisk = useCallback(
    async (ids: string[], tracks: Track[]) => {
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
        queryClient.invalidateQueries({ queryKey: libraryKeys.all });
        queryClient.invalidateQueries({ queryKey: playlistKeys.all });

        toast.success(
          ids.length > 1
            ? tToast('movedTracksToRecycle', { count: filesMovedToTrash })
            : tToast('movedToRecycle')
        );
      } catch {
        toast.error(filesMovedToTrash > 0 ? tToast('recyclePartialFail') : tToast('recycleFail'));
      }
    },
    [removeFromDb, removeFromLibrary, tToast]
  );

  return { handleRemoveFromLibrary, handleDeleteFromDisk };
}
