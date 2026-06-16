import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { shuffleItems } from '@/lib/playlists';
import { useViewStore } from '@/stores/useViewStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { useContextMenuDismiss } from '@/hooks/useContextMenuDismiss';
import { playlistKeys } from '@/hooks/queries/usePlaylists';
import { logger } from '@/lib/logger';
import type {
  IPlaylistContextMenuProps,
  IPlaylistContextMenuView,
} from './PlaylistContextMenu.types';

export function usePlaylistContextMenu({
  playlist,
  position,
  onClose,
}: IPlaylistContextMenuProps): IPlaylistContextMenuView {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const menuRef = useRef<HTMLDivElement>(null);
  const adjustedPosition = useContextMenuDismiss(menuRef, position, onClose);
  const navigateTo = useViewStore(s => s.navigateTo);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const queryClient = useQueryClient();

  const loadPlaylistTracks = useCallback(async () => {
    if (!IS_ELECTRON) return [];

    try {
      const tracks = await queryClient.fetchQuery({
        queryKey: playlistKeys.tracks(playlist.id),
        queryFn: async () =>
          (await window.electronAPI.db.playlists.getTracks(playlist.id)) as Track[],
      });
      if (tracks.length === 0) {
        toast.info(tToast('playlistNoTracks', { name: playlist.name }));
      }
      return tracks;
    } catch (err) {
      logger.warn('Failed to load playlist tracks', err);
      return [];
    }
  }, [playlist.id, playlist.name, tToast, queryClient]);

  const onOpen = useCallback(() => {
    navigateTo('playlists', playlist.id);
    onClose();
  }, [navigateTo, onClose, playlist.id]);

  const onPlay = useCallback(async () => {
    const tracks = await loadPlaylistTracks();
    if (tracks.length === 0) return;

    setQueue(tracks, 0);
    onClose();
  }, [loadPlaylistTracks, onClose, setQueue]);

  const onShuffle = useCallback(async () => {
    const tracks = await loadPlaylistTracks();
    if (tracks.length === 0) return;

    setQueue(shuffleItems(tracks), 0);
    onClose();
  }, [loadPlaylistTracks, onClose, setQueue]);

  return {
    t,
    menuRef,
    adjustedPosition,
    onOpen,
    onPlay,
    onShuffle,
  };
}
