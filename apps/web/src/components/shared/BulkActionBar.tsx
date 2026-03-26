import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  ListPlus,
  Heart,
  Trash2,
  X,
  Plus,
  Loader2,
  CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useRemoveFromLibrary } from '@/hooks/useRemoveFromLibrary';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  usePlaylistsQuery,
  useCreatePlaylistMutation,
  useAddTrackToPlaylistMutation,
} from '@/hooks/queries/usePlaylists';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';

interface BulkActionBarProps {
  trackList: Track[];
  onRemoveFromPlaylist?: (trackIds: string[]) => void;
}

function PlaylistPopover({ trackIds, onDone }: { trackIds: string[]; onDone: () => void }) {
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');
  const { data: playlists = [], isLoading } = usePlaylistsQuery();
  const addTrackMutation = useAddTrackToPlaylistMutation();
  const createPlaylistMutation = useCreatePlaylistMutation();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, onDone);

  const handleAdd = useCallback(async (playlist: Playlist) => {
    try {
      await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
      toast.success(tToast('addedTracksToPlaylist', { count: trackIds.length, name: playlist.name }));
      onDone();
    } catch {
      toast.error(tToast('failedAddToPlaylist'));
    }
  }, [trackIds, addTrackMutation, onDone]);

  const handleCreateAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const playlist = await createPlaylistMutation.mutateAsync({ name });
      await addTrackMutation.mutateAsync({ playlistId: playlist.id, trackIds });
      toast.success(tToast('createdPlaylistAddedTracks', { name: playlist.name, count: trackIds.length }));
      onDone();
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
    }
  }, [newName, trackIds, createPlaylistMutation, addTrackMutation, onDone]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 4 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
      onClick={(e) => e.stopPropagation()}
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
                onClick={() => handleAdd(pl)}
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
    </motion.div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

function ActionButton({ icon, label, onClick, variant = 'default' }: ActionButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
        variant === 'destructive'
          ? 'text-destructive/80 hover:text-destructive hover:bg-destructive/10'
          : 'text-foreground/70 hover:text-foreground hover:bg-accent'
      )}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  );
}

export function BulkActionBar({ trackList, onRemoveFromPlaylist }: BulkActionBarProps) {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');

  const selectedTrackIds = useSelectionStore((s) => s.selectedTrackIds);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const count = selectedTrackIds.size;

  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNext = usePlayerStore((s) => s.playNext);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const library = usePlayerStore((s) => s.library);

  const { handleRemoveFromLibrary, handleDeleteFromDisk } = useRemoveFromLibrary();
  const [showPlaylistPopover, setShowPlaylistPopover] = useState(false);

  if (count === 0) return null;

  const selectedTracks = library.filter((t) => selectedTrackIds.has(t.id));
  const resolvedTracks = selectedTracks.length > 0 ? selectedTracks : trackList.filter((t) => selectedTrackIds.has(t.id));
  const ids = Array.from(selectedTrackIds);

  const handlePlayNext = () => {
    for (const t of resolvedTracks) {
      playNext(t);
    }
    toast.success(tToast('tracksPlayNext', { count }));
    clearSelection();
  };

  const handleAddToQueue = () => {
    addToQueue(resolvedTracks);
    toast.success(tToast('addedTracksToQueue', { count }));
    clearSelection();
  };

  const handleToggleFavorite = () => {
    for (const id of ids) {
      toggleFavorite(id);
    }
    clearSelection();
  };

  const onRemoveFromLibrary = async () => {
    await handleRemoveFromLibrary(ids);
    clearSelection();
  };

  const onDeleteFromDisk = async () => {
    await handleDeleteFromDisk(ids, resolvedTracks);
    clearSelection();
  };

  const handleRemoveFromPlaylistClick = () => {
    if (onRemoveFromPlaylist) {
      onRemoveFromPlaylist(ids);
      clearSelection();
    }
  };

  const allSelected = count === trackList.length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-2 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/30 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-none"
      >
        <span className="text-xs font-medium text-muted-foreground px-2 whitespace-nowrap">
          {tCommon('selectedTracks', { count })}
        </span>

        <div className="w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => allSelected ? clearSelection() : selectAll(trackList)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors"
          title={allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{allSelected ? tCommon('clearSelection') : tCommon('selectAll')}</span>
        </motion.button>

        <div className="w-px h-5 bg-border/50 mx-1" />

        <ActionButton
          icon={<Play className="w-3.5 h-3.5" />}
          label={t('playNext')}
          onClick={handlePlayNext}
        />
        <ActionButton
          icon={<ListPlus className="w-3.5 h-3.5" />}
          label={t('addToQueue')}
          onClick={handleAddToQueue}
        />

        <div className="relative">
          <ActionButton
            icon={<ListPlus className="w-3.5 h-3.5" />}
            label={t('addToPlaylist')}
            onClick={() => setShowPlaylistPopover((v) => !v)}
          />
          <AnimatePresence>
            {showPlaylistPopover && (
              <PlaylistPopover
                trackIds={ids}
                onDone={() => {
                  setShowPlaylistPopover(false);
                  clearSelection();
                }}
              />
            )}
          </AnimatePresence>
        </div>

        <ActionButton
          icon={<Heart className="w-3.5 h-3.5" />}
          label={t('toggleFavorites')}
          onClick={handleToggleFavorite}
        />

        {onRemoveFromPlaylist && (
          <ActionButton
            icon={<X className="w-3.5 h-3.5" />}
            label={t('removeFromPlaylist')}
            onClick={handleRemoveFromPlaylistClick}
            variant="destructive"
          />
        )}

        <div className="w-px h-5 bg-border/50 mx-1" />

        <ActionButton
          icon={<Trash2 className="w-3.5 h-3.5" />}
          label={t('removeFromLibrary')}
          onClick={onRemoveFromLibrary}
          variant="destructive"
        />
        {IS_ELECTRON && (
          <ActionButton
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={t('deleteFromDisk')}
            onClick={onDeleteFromDisk}
            variant="destructive"
          />
        )}

        <div className="w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={clearSelection}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
          title={tCommon('clearSelection')}
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
