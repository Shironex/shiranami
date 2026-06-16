import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import type { Track } from '@/stores/types';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { useRemoveFromLibrary } from '@/hooks/useRemoveFromLibrary';
import { useTrackActions } from '@/hooks/useTrackActions';
import { useContextMenuDismiss } from '@/hooks/useContextMenuDismiss';
import type { ITrackContextMenuProps, ITrackContextMenuView } from './TrackContextMenu.types';

export function useTrackContextMenu({
  track,
  position,
  onClose,
}: ITrackContextMenuProps): ITrackContextMenuView {
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
  const isFavorite = Boolean(
    overlayFavorite ?? queue.find(t => t.id === track.id)?.isFavorite ?? track.isFavorite
  );

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

  const handleShare = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(DIALOG_EVENTS.openShare, {
        detail: { type: 'track', id: track.id },
      })
    );
    onClose();
  }, [track.id, onClose]);

  const handleFindMissingMetadata = useCallback(() => {
    if (isBulkEnriching) return;
    window.dispatchEvent(
      new CustomEvent(DIALOG_EVENTS.openTrackEnrich, {
        detail: { trackId: track.id },
      })
    );
    onClose();
  }, [track.id, onClose, isBulkEnriching]);

  const handleEditTags = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(DIALOG_EVENTS.openEditTags, {
        detail: { trackId: track.id },
      })
    );
    onClose();
  }, [track.id, onClose]);

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

  const onClearAndClose = useCallback(() => {
    clearSelection();
    onClose();
  }, [clearSelection, onClose]);

  return {
    t,
    menuRef,
    adjustedPosition,
    isBulk,
    count,
    targetTrackIds,
    isFavorite,
    isBulkEnriching,
    onPlayNext: handlePlayNext,
    onAddToQueue: handleAddToQueue,
    onToggleFavorite: handleToggleFavorite,
    onMoreLikeThis: handleMoreLikeThis,
    onNotInterested: handleNotInterested,
    onShowInFolder: handleShowInFolder,
    onShare: handleShare,
    onFindMissingMetadata: handleFindMissingMetadata,
    onEditTags: handleEditTags,
    onRemoveFromLibrary,
    onDeleteFromDisk,
    onClearAndClose,
  };
}
