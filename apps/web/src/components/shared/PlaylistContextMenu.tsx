import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ListMusic, Play, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import { IS_ELECTRON } from '@/lib/platform';
import { shuffleItems } from '@/lib/playlists';
import { useAppStore } from '@/stores/useAppStore';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useContextMenuDismiss, type ContextMenuPosition } from '@/hooks/useContextMenuDismiss';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

interface PlaylistContextMenuProps {
  playlist: Playlist;
  position: ContextMenuPosition;
  onClose: () => void;
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
        {icon}
      </span>
      {label}
    </button>
  );
}

export function PlaylistContextMenu({
  playlist,
  position,
  onClose,
}: PlaylistContextMenuProps) {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const menuRef = useRef<HTMLDivElement>(null);
  const adjustedPosition = useContextMenuDismiss(menuRef, position, onClose);
  const navigateTo = useAppStore((s) => s.navigateTo);
  const setQueue = usePlayerStore((s) => s.setQueue);
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
      console.warn('Failed to load playlist tracks', err);
      return [];
    }
  }, [playlist.id, playlist.name, tToast, queryClient]);

  const handleOpen = useCallback(() => {
    navigateTo('playlists', playlist.id);
    onClose();
  }, [navigateTo, onClose, playlist.id]);

  const handlePlay = useCallback(async () => {
    const tracks = await loadPlaylistTracks();
    if (tracks.length === 0) return;

    setQueue(tracks, 0);
    onClose();
  }, [loadPlaylistTracks, onClose, setQueue]);

  const handleShuffle = useCallback(async () => {
    const tracks = await loadPlaylistTracks();
    if (tracks.length === 0) return;

    setQueue(shuffleItems(tracks), 0);
    onClose();
  }, [loadPlaylistTracks, onClose, setQueue]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.12 }}
        className="fixed z-50 min-w-[200px] py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/30"
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          transformOrigin: 'top left',
        }}
        onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
      >
        <MenuItem
          icon={<ListMusic className="w-4 h-4" />}
          label={t('openPlaylist')}
          onClick={handleOpen}
        />
        <MenuItem
          icon={<Play className="w-4 h-4" />}
          label={t('playPlaylist')}
          onClick={handlePlay}
        />
        <MenuItem
          icon={<Shuffle className="w-4 h-4" />}
          label={t('shufflePlaylist')}
          onClick={handleShuffle}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
