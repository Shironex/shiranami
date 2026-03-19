import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ListMusic, Play, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import type { Playlist } from '@/types/electron';
import { IS_ELECTRON } from '@/lib/platform';
import { shuffleItems } from '@/lib/playlists';
import { useAppStore } from '@/stores/useAppStore';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import type { ContextMenuPosition } from './TrackContextMenu';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const navigateTo = useAppStore((s) => s.navigateTo);
  const setQueue = usePlayerStore((s) => s.setQueue);

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    let { x, y } = position;

    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }
    if (x < 0) x = 8;
    if (y < 0) y = 8;

    setAdjustedPosition({ x, y });
  }, [position]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => onClose();

    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const loadPlaylistTracks = useCallback(async () => {
    if (!IS_ELECTRON) return [];

    const tracks = (await window.electronAPI.db.playlists.getTracks(playlist.id)) as Track[];
    if (tracks.length === 0) {
      toast.info(`"${playlist.name}" has no tracks yet`);
    }
    return tracks;
  }, [playlist.id, playlist.name]);

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
        onContextMenu={(event) => event.preventDefault()}
      >
        <MenuItem
          icon={<ListMusic className="w-4 h-4" />}
          label="Open Playlist"
          onClick={handleOpen}
        />
        <MenuItem
          icon={<Play className="w-4 h-4" />}
          label="Play Playlist"
          onClick={handlePlay}
        />
        <MenuItem
          icon={<Shuffle className="w-4 h-4" />}
          label="Shuffle Playlist"
          onClick={handleShuffle}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
