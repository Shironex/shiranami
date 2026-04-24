import { useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useCreatePlaylistsFromSubfoldersMutation } from '@/hooks/queries/usePlaylists';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TrackMetadata } from '@/types/electron';

export interface SubfolderEntry {
  name: string;
  path: string;
  tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
}

export function useSubfolderPlaylistConfirm() {
  const { t: tToast } = useTranslation('toast');
  const createPlaylistsMutation = useCreatePlaylistsFromSubfoldersMutation();

  const handleSubfolderConfirm = useCallback(
    async (selectedSubfolders: SubfolderEntry[]) => {
      if (!IS_ELECTRON) return;
      try {
        const libraryTracks = useLibraryStore.getState().library;
        const pathToId = new Map(libraryTracks.map(t => [t.filePath, t.id]));

        const subfolderData = selectedSubfolders.map(sf => ({
          name: sf.name,
          trackIds: sf.tracks
            .map(track => pathToId.get(track.filePath))
            .filter((id): id is string => !!id),
        }));

        const created = await createPlaylistsMutation.mutateAsync(
          subfolderData.filter(sf => sf.trackIds.length > 0)
        );

        if (created.length > 0) {
          toast.success(tToast('playlistsCreatedFromSubfolders', { count: created.length }));
        } else {
          toast.info(tToast('noNewSubfolders'));
        }
      } catch (err) {
        console.error('Failed to create playlists from subfolders:', err);
        toast.error(tToast('playlistsCreationFailed'));
      }
    },
    [createPlaylistsMutation, tToast]
  );

  return handleSubfolderConfirm;
}
