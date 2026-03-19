import { useState, useEffect, useCallback, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { ListPlus, Plus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Playlist } from '@/types/electron';
import { notifyPlaylistsChanged } from '@/lib/playlists';

interface AddToPlaylistButtonProps {
  trackId: string;
  className?: string;
}

export function AddToPlaylistButton({ trackId, className }: AddToPlaylistButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowNewForm(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleOpen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!IS_ELECTRON) return;
    setIsOpen(prev => !prev);
    if (!isOpen) {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.db.playlists.getAll() as Playlist[];
        setPlaylists(result);
      } catch {
        toast.error('Failed to load playlists');
      } finally {
        setIsLoading(false);
      }
    }
  }, [isOpen]);

  const handleAddToPlaylist = useCallback(async (e: React.MouseEvent, playlist: Playlist) => {
    e.stopPropagation();
    if (!IS_ELECTRON) return;
    try {
      await window.electronAPI.db.playlists.addTrack(playlist.id, trackId);
      toast.success(`Added to "${playlist.name}"`);
      setIsOpen(false);
    } catch {
      toast.error('Failed to add to playlist');
    }
  }, [trackId]);

  const handleCreateAndAdd = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const name = newName.trim();
    if (!name || !IS_ELECTRON) return;
    try {
      const playlist = await window.electronAPI.db.playlists.create({ name }) as Playlist;
      await window.electronAPI.db.playlists.addTrack(playlist.id, trackId);
      notifyPlaylistsChanged();
      toast.success(`Created "${playlist.name}" and added track`);
      setIsOpen(false);
      setShowNewForm(false);
      setNewName('');
    } catch {
      toast.error('Failed to create playlist');
    }
  }, [newName, trackId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleCreateAndAdd(e);
    if (e.key === 'Escape') {
      setShowNewForm(false);
      setNewName('');
    }
  }, [handleCreateAndAdd]);

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.75 }}
        onClick={handleOpen}
        className={cn(
          'shrink-0 p-1 rounded-md transition-colors duration-150',
          'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60',
          className,
        )}
        aria-label="Add to playlist"
      >
        <ListPlus className="w-3.5 h-3.5" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 bottom-full mb-1 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
            onClick={e => e.stopPropagation()}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 text-muted-foreground/40 animate-spin" />
              </div>
            ) : (
              <>
                <div className="max-h-40 overflow-y-auto scrollbar-thin">
                  {playlists.length === 0 && !showNewForm && (
                    <p className="px-3 py-2 text-xs text-muted-foreground/50">No playlists</p>
                  )}
                  {playlists.map(pl => (
                    <button
                      key={pl.id}
                      onClick={(e) => handleAddToPlaylist(e, pl)}
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
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onClick={e => e.stopPropagation()}
                        placeholder="Name..."
                        className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none min-w-0"
                      />
                      <button
                        onClick={handleCreateAndAdd}
                        disabled={!newName.trim()}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowNewForm(true); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary/80 hover:text-primary hover:bg-accent transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      New Playlist
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
