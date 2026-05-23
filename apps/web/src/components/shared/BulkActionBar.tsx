import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, ListPlus, Heart, Trash2, X, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useRemoveFromLibrary } from '@/hooks/useRemoveFromLibrary';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface BulkActionBarProps {
  trackList: Track[];
  onRemoveFromPlaylist?: (trackIds: string[]) => void;
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

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const selectAll = useSelectionStore(s => s.selectAll);
  const count = selectedTrackIds.size;

  const addToQueue = usePlaybackStore(s => s.addToQueue);
  const playNext = usePlaybackStore(s => s.playNext);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const library = useLibraryStore(s => s.library);

  const { handleRemoveFromLibrary, handleDeleteFromDisk } = useRemoveFromLibrary();

  if (count === 0) return null;

  const selectedTracks = library.filter(t => selectedTrackIds.has(t.id));
  const resolvedTracks =
    selectedTracks.length > 0 ? selectedTracks : trackList.filter(t => selectedTrackIds.has(t.id));
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
          onClick={() => (allSelected ? clearSelection() : selectAll(trackList))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors"
          title={allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
          </span>
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
