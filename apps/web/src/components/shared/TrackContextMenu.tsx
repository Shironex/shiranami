import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useMutation } from '@tanstack/react-query';
import {
  Play,
  ListPlus,
  Heart,
  Share2,
  FolderOpen,
  Trash2,
  ChevronRight,
  Disc3,
  Pencil,
  Radio,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import type { Track } from '@/stores/types';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { useRemoveFromLibrary } from '@/hooks/useRemoveFromLibrary';
import { useTrackActions } from '@/hooks/useTrackActions';
import { useContextMenuDismiss, type ContextMenuPosition } from '@/hooks/useContextMenuDismiss';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PlaylistPickerContent } from './PlaylistPickerContent';

export type { ContextMenuPosition };

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
  disabled?: boolean;
  title?: string;
}

function MenuItem({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  title,
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-disabled={disabled || undefined}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
        disabled
          ? 'text-muted-foreground/50 cursor-not-allowed'
          : variant === 'destructive'
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

function PlaylistSubmenu({ trackIds, onClose }: { trackIds: string[]; onClose: () => void }) {
  const { t } = useTranslation('contextMenu');
  const parentRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
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
    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    const submenuWidth = 192;
    if (rect.right + submenuWidth > window.innerWidth) {
      setSubmenuSide('left');
    }
  }, []);

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
          <PlaylistPickerContent trackIds={trackIds} onDone={onClose} />
        </div>
      )}
    </div>
  );
}

export function TrackContextMenu({ track, position, onClose }: TrackContextMenuProps) {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const menuRef = useRef<HTMLDivElement>(null);
  const adjustedPosition = useContextMenuDismiss(menuRef, position, onClose);

  const setQueue = usePlaybackStore(s => s.setQueue);
  const queue = usePlaybackStore(s => s.queue);
  const library = useLibraryStore(s => s.library);

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);

  const trackActions = useTrackActions({ onComplete: onClose });

  // Disable the per-track enrich entry while a bulk run holds the abort slot —
  // the IPC would reject anyway, but a visibly-disabled item is friendlier
  // than a toast after the click.
  const isBulkEnriching = useMetadataEnrichStore(s => s.isEnriching);

  const { handleRemoveFromLibrary, handleDeleteFromDisk } = useRemoveFromLibrary();

  const showInFolderMutation = useMutation({
    mutationFn: async (filePath: string) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.shell.showInFolder(filePath);
    },
    onError: () => {
      toast.error(tToast('failedOpenLocation'));
    },
  });

  // Determine if this is a bulk operation
  const isBulk = selectedTrackIds.size > 1 && selectedTrackIds.has(track.id);
  const targetTrackIds = isBulk ? Array.from(selectedTrackIds) : [track.id];
  const targetTracks = isBulk ? library.filter(t => selectedTrackIds.has(t.id)) : [track];
  const count = targetTrackIds.length;

  // Overlay is the freshest source after Phase 2 of the mutation-overlay
  // refactor; queue / track props are stale once a toggle lands.
  const overlayVersion = useTrackOverlayStore(s => s.version);
  void overlayVersion;
  const overlayFavorite = useTrackOverlayStore.getState().overlays.get(track.id)?.isFavorite;
  const isFavorite =
    overlayFavorite ?? queue.find(t => t.id === track.id)?.isFavorite ?? track.isFavorite;

  const handlePlayNext = useCallback(
    () => trackActions.handlePlayNext(targetTracks),
    [trackActions, targetTracks]
  );

  const handleAddToQueue = useCallback(
    () => trackActions.handleAddToQueue(targetTracks),
    [trackActions, targetTracks]
  );

  const handleToggleFavorite = useCallback(
    () => trackActions.handleToggleFavorite(targetTrackIds),
    [trackActions, targetTrackIds]
  );

  // "More like this" / song radio: rank library tracks by content similarity to
  // this seed (main process), then build a queue of the seed followed by the
  // ranked matches resolved against the in-memory library.
  const moreLikeThisMutation = useMutation({
    mutationFn: async (seedId: string) => {
      if (!IS_ELECTRON) return;
      const results = await window.electronAPI.recommendations.similar(seedId);
      const byId = new Map(library.map(t => [t.id, t]));
      const similar = results.map(r => byId.get(r.trackId)).filter((t): t is Track => Boolean(t));
      if (similar.length === 0) {
        toast.info(tToast('noSimilarTracks'));
        return;
      }
      const seed = byId.get(seedId) ?? track;
      setQueue([seed, ...similar], 0);
      toast.success(tToast('startedSongRadio', { title: seed.title }));
    },
    onError: () => {
      toast.error(tToast('failedSongRadio'));
    },
  });

  const handleMoreLikeThis = useCallback(() => {
    if (!IS_ELECTRON) return;
    moreLikeThisMutation.mutate(track.id);
    onClose();
  }, [track.id, onClose, moreLikeThisMutation]);

  // Negative signal: mark this track "Not interested". Fire-and-forget; the
  // affinity engine drops it (and softly downranks its artist) on the next
  // recommendation read. Offers an undo via the toast action.
  const notInterestedMutation = useMutation({
    mutationFn: async (trackId: string) => {
      if (!IS_ELECTRON) return;
      await window.electronAPI.recommendations.notInterested(trackId);
    },
    onSuccess: (_data, trackId) => {
      toast.success(tToast('markedNotInterested'), {
        action: {
          label: tToast('undo'),
          onClick: () => {
            void (async () => {
              try {
                await window.electronAPI.recommendations.undoNotInterested(trackId);
              } catch {
                toast.error(tToast('failedUndoNotInterested'));
              }
            })();
          },
        },
      });
    },
    onError: () => {
      toast.error(tToast('failedNotInterested'));
    },
  });

  const handleNotInterested = useCallback(() => {
    if (!IS_ELECTRON) return;
    notInterestedMutation.mutate(track.id);
    onClose();
  }, [track.id, onClose, notInterestedMutation]);

  const handleShowInFolder = useCallback(() => {
    if (!IS_ELECTRON) return;
    showInFolderMutation.mutate(track.filePath);
    onClose();
  }, [track.filePath, onClose, showInFolderMutation]);

  const onRemoveFromLibrary = useCallback(async () => {
    await handleRemoveFromLibrary(targetTrackIds);
    clearSelection();
    onClose();
  }, [targetTrackIds, handleRemoveFromLibrary, clearSelection, onClose]);

  const onDeleteFromDisk = useCallback(async () => {
    await handleDeleteFromDisk(targetTrackIds, targetTracks);
    clearSelection();
    onClose();
  }, [targetTrackIds, targetTracks, handleDeleteFromDisk, clearSelection, onClose]);

  const handleClose = useCallback(() => {
    clearSelection();
    onClose();
  }, [clearSelection, onClose]);

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
        onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      >
        {isBulk && (
          <>
            <div className="px-3 py-1.5 text-xs text-muted-foreground/50 font-medium">
              {t('selectedCount', { count })}
            </div>
            <Divider />
          </>
        )}

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

        {IS_ELECTRON && !isBulk && (
          <MenuItem
            icon={<Radio className="w-4 h-4" />}
            label={t('moreLikeThis')}
            onClick={handleMoreLikeThis}
          />
        )}

        {IS_ELECTRON && !isBulk && (
          <MenuItem
            icon={<ThumbsDown className="w-4 h-4" />}
            label={t('notInterested')}
            onClick={handleNotInterested}
          />
        )}

        <Divider />

        <PlaylistSubmenu trackIds={targetTrackIds} onClose={handleClose} />

        <MenuItem
          icon={
            <Heart
              className={cn('w-4 h-4', !isBulk && isFavorite && 'fill-current text-favorite')}
            />
          }
          label={
            isBulk
              ? t('toggleFavorites')
              : isFavorite
                ? t('removeFromFavorites')
                : t('addToFavorites')
          }
          onClick={handleToggleFavorite}
        />

        {IS_ELECTRON && !isBulk && (
          <MenuItem
            icon={<Share2 className="w-4 h-4" />}
            label={t('share', { ns: 'share' })}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(DIALOG_EVENTS.openShare, {
                  detail: { type: 'track', id: track.id },
                })
              );
              onClose();
            }}
          />
        )}

        {IS_ELECTRON && !isBulk && (
          <MenuItem
            icon={<Disc3 className="w-4 h-4" />}
            label={t('findMissingMetadata')}
            disabled={isBulkEnriching}
            title={isBulkEnriching ? t('findMissingMetadataBusy') : undefined}
            onClick={() => {
              if (isBulkEnriching) return;
              window.dispatchEvent(
                new CustomEvent(DIALOG_EVENTS.openTrackEnrich, {
                  detail: { trackId: track.id },
                })
              );
              onClose();
            }}
          />
        )}

        {IS_ELECTRON && !isBulk && (
          <MenuItem
            icon={<Pencil className="w-4 h-4" />}
            label={t('editTags')}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(DIALOG_EVENTS.openEditTags, {
                  detail: { trackId: track.id },
                })
              );
              onClose();
            }}
          />
        )}

        <Divider />

        {IS_ELECTRON && !isBulk && (
          <MenuItem
            icon={<FolderOpen className="w-4 h-4" />}
            label={IS_MAC ? t('showInFinder') : t('showInExplorer')}
            onClick={handleShowInFolder}
          />
        )}

        <MenuItem
          icon={<Trash2 className="w-4 h-4" />}
          label={isBulk ? t('removeFromLibraryCount', { count }) : t('removeFromLibrary')}
          onClick={onRemoveFromLibrary}
          variant="destructive"
        />
        {IS_ELECTRON && (
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label={isBulk ? t('deleteFromDiskCount', { count }) : t('deleteFromDisk')}
            onClick={onDeleteFromDisk}
            variant="destructive"
          />
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
