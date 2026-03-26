import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  ListPlus,
  Heart,
  FolderOpen,
  Trash2,
  Plus,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';
import { notifyPlaylistsChanged } from '@/lib/playlists';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface TrackContextMenuProps {
  track: Track;
  position: ContextMenuPosition;
  onClose: () => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

function MenuItem({ icon, label, onClick, variant = 'default' }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
        variant === 'destructive'
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground/80 hover:text-foreground hover:bg-accent'
      )}
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
        {icon}
      </span>
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-border/50" />;
}

function PlaylistSubmenu({ track, onClose }: { track: Track; onClose: () => void }) {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const submenuRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsSubmenuOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    (async () => {
      try {
        const result = (await window.electronAPI.db.playlists.getAll()) as Playlist[];
        setPlaylists(result);
      } catch {
        toast.error(tToast('failedLoadPlaylists'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Determine if submenu should open left or right based on available space
  useEffect(() => {
    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    const submenuWidth = 192; // w-48
    if (rect.right + submenuWidth > window.innerWidth) {
      setSubmenuSide('left');
    }
  }, []);

  const handleAddToPlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!IS_ELECTRON) return;
      try {
        await window.electronAPI.db.playlists.addTrack(playlist.id, track.id);
        toast.success(tToast('addedToPlaylist', { name: playlist.name }));
        onClose();
      } catch {
        toast.error(tToast('failedAddToPlaylist'));
      }
    },
    [track.id, onClose]
  );

  const handleCreateAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name || !IS_ELECTRON) return;
    try {
      const playlist = (await window.electronAPI.db.playlists.create({ name })) as Playlist;
      await window.electronAPI.db.playlists.addTrack(playlist.id, track.id);
      notifyPlaylistsChanged();
      toast.success(tToast('createdPlaylistAdded', { name: playlist.name }));
      onClose();
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
    }
  }, [newName, track.id, onClose]);

  return (
    <div
      ref={parentRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left cursor-default',
          'text-foreground/80 hover:text-foreground hover:bg-accent'
        )}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
          <ListPlus className="w-4 h-4" />
        </span>
        {t('addToPlaylist')}
        <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />
      </div>

      {isSubmenuOpen && (
        <div
          ref={submenuRef}
          className={cn(
            'absolute top-0 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20',
            submenuSide === 'right' ? 'left-full ml-0.5' : 'right-full mr-0.5'
          )}
        >
        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-4 h-4 text-muted-foreground/40 animate-spin" />
          </div>
        ) : (
          <>
            <div className="max-h-40 overflow-y-auto scrollbar-thin">
              {playlists.length === 0 && !showNewForm && (
                <p className="px-3 py-2 text-xs text-muted-foreground/50">{tCommon('noPlaylists')}</p>
              )}
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => handleAddToPlaylist(pl)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-accent transition-colors text-left"
                >
                  <ListPlus className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  <span className="truncate">{pl.name}</span>
                </button>
              ))}
            </div>

            <div className="border-t border-border/30 mt-1 pt-1">
              {showNewForm ? (
                <div className="px-2 py-1 flex items-center gap-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') handleCreateAndAdd();
                      if (e.key === 'Escape') {
                        setShowNewForm(false);
                        setNewName('');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={tCommon('namePlaceholder')}
                    className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none min-w-0"
                  />
                  <button
                    onClick={handleCreateAndAdd}
                    disabled={!newName.trim()}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
                  >
                    {tCommon('add')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary/80 hover:text-primary hover:bg-accent transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {tCommon('newPlaylist')}
                </button>
              )}
            </div>
          </>
        )}
        </div>
      )}
    </div>
  );
}

export function TrackContextMenu({ track, position, onClose }: TrackContextMenuProps) {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const removeFromLibrary = usePlayerStore((s) => s.removeFromLibrary);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const next = usePlayerStore((s) => s.next);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);

  // Resolve the current favorite state from the queue (in case toggled after menu opened)
  const isFavorite = queue.find((t) => t.id === track.id)?.isFavorite ?? track.isFavorite;

  // Adjust position so menu stays within viewport
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

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a timeout so the initial right-click event doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on scroll
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePlayNext = useCallback(() => {
    playNext(track);
    toast.success(tToast('trackPlayNext'));
    onClose();
  }, [track, playNext, onClose]);

  const handleAddToQueue = useCallback(() => {
    addToQueue([track]);
    toast.success(tToast('addedToQueue'));
    onClose();
  }, [track, addToQueue, onClose]);

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(track.id);
    onClose();
  }, [track.id, toggleFavorite, onClose]);

  const handleShowInFolder = useCallback(() => {
    if (!IS_ELECTRON) return;
    window.electronAPI.shell.showInFolder(track.filePath).catch(() => {
      toast.error(tToast('failedOpenLocation'));
    });
    onClose();
  }, [track.filePath, onClose]);

  const handleRemoveFromLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return;
    try {
      // If this track is currently playing, skip to next first
      const isCurrentlyPlaying = currentTrack?.id === track.id;

      // Remove from DB
      await window.electronAPI.db.tracks.remove(track.id);

      // Remove from library state
      removeFromLibrary([track.id]);

      // Remove from queue if present
      const idx = queue.findIndex((t) => t.id === track.id);
      if (idx !== -1) {
        const newQueue = queue.filter((t) => t.id !== track.id);
        let newIndex = queueIndex;
        if (idx < queueIndex) {
          newIndex--;
        }
        if (isCurrentlyPlaying) {
          // Move to next track or clear
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
      }

      toast.success(tToast('removedFromLibrary'));
    } catch {
      toast.error(tToast('failedRemoveTrack'));
    }
    onClose();
  }, [track, currentTrack, queue, queueIndex, removeFromLibrary, next, onClose]);

  const handleDeleteFromDisk = useCallback(async () => {
    if (!IS_ELECTRON) return;
    let fileMovedToTrash = false;
    try {
      const isCurrentlyPlaying = currentTrack?.id === track.id;

      // Move file to recycle bin
      await window.electronAPI.shell.trashFile(track.filePath);
      fileMovedToTrash = true;

      // Remove from DB after the file move succeeds
      await window.electronAPI.db.tracks.remove(track.id);

      // Remove from library state
      removeFromLibrary([track.id]);

      // Remove from queue if present
      const idx = queue.findIndex((t) => t.id === track.id);
      if (idx !== -1) {
        const newQueue = queue.filter((t) => t.id !== track.id);
        let newIndex = queueIndex;
        if (idx < queueIndex) {
          newIndex--;
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
      }

      toast.success(tToast('movedToRecycle'));
    } catch {
      toast.error(
        fileMovedToTrash
          ? tToast('recyclePartialFail')
          : tToast('recycleFail')
      );
    }
    onClose();
  }, [track, currentTrack, queue, queueIndex, removeFromLibrary, next, onClose]);

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
        onContextMenu={(e) => e.preventDefault()}
      >
        <MenuItem
          icon={<Play className="w-4 h-4" />}
          label={t('playNext')}
          onClick={handlePlayNext}
        />
        <MenuItem
          icon={<ListPlus className="w-4 h-4" />}
          label={t('addToQueue')}
          onClick={handleAddToQueue}
        />

        <Divider />

        <PlaylistSubmenu track={track} onClose={onClose} />

        <MenuItem
          icon={
            <Heart
              className={cn('w-4 h-4', isFavorite && 'fill-current text-red-400')}
            />
          }
          label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
          onClick={handleToggleFavorite}
        />

        <Divider />

        {IS_ELECTRON && (
          <MenuItem
            icon={<FolderOpen className="w-4 h-4" />}
            label={IS_MAC ? t('showInFinder') : t('showInExplorer')}
            onClick={handleShowInFolder}
          />
        )}

        <MenuItem
          icon={<Trash2 className="w-4 h-4" />}
          label={t('removeFromLibrary')}
          onClick={handleRemoveFromLibrary}
          variant="destructive"
        />
        {IS_ELECTRON && (
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label={t('deleteFromDisk')}
            onClick={handleDeleteFromDisk}
            variant="destructive"
          />
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
