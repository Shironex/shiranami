import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useCreatePlaylistWithTracksMutation } from '@/hooks/queries/usePlaylists';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { IQueuePanelProps, IQueuePanelView, IQueueUpNextRow } from './QueuePanel.types';

/** Parse the absolute queue index out of a `queue-<n>` sortable id. */
function indexOfSortableId(id: string | number): number {
  return parseInt(String(id).replace('queue-', ''), 10);
}

export function useQueuePanel(props: IQueuePanelProps = {}): IQueuePanelView {
  const { headerAction } = props;
  const { t } = useTranslation('queue');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');

  const queue = usePlaybackStore(s => s.queue);
  const queueIndex = usePlaybackStore(s => s.queueIndex);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const removeFromQueue = usePlaybackStore(s => s.removeFromQueue);
  const reorderQueue = usePlaybackStore(s => s.reorderQueue);
  const clearQueue = usePlaybackStore(s => s.clearQueue);
  const togglePlay = usePlaybackStore(s => s.togglePlay);

  // Refs keep the play handler stable while still reading the latest queue +
  // active index (the handler is forwarded to memoized rows).
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;

  const onPlayIndex = useCallback(
    (index: number) => {
      if (index === queueIndexRef.current) {
        togglePlay();
      } else {
        setQueue(queueRef.current, index);
      }
    },
    [setQueue, togglePlay]
  );

  const onRemove = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      removeFromQueue(index);
    },
    [removeFromQueue]
  );

  const upNextOffset = queueIndex + 1;

  // Sortable ids use the absolute queue index so duplicate tracks stay distinct.
  const upNextRows = useMemo<IQueueUpNextRow[]>(
    () =>
      queue.slice(upNextOffset).map((track, i) => ({
        sortableId: `queue-${i + upNextOffset}`,
        track,
        queueIndex: i + upNextOffset,
      })),
    [queue, upNextOffset]
  );

  const sortableIds = useMemo(() => upNextRows.map(row => row.sortableId), [upNextRows]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeTrack = useMemo(() => {
    if (!activeId) return null;
    return queue[indexOfSortableId(activeId)] ?? null;
  }, [activeId, queue]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;
      reorderQueue(indexOfSortableId(active.id), indexOfSortableId(over.id));
    },
    [reorderQueue]
  );

  const onDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Clearing stops playback and drops every track — destructive enough to gate
  // behind the same popover-confirm pattern DownloadsView uses for Cancel all.
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const onConfirmClear = useCallback(() => {
    clearQueue();
    setShowClearConfirm(false);
  }, [clearQueue]);

  const onCancelClear = useCallback(() => {
    setShowClearConfirm(false);
  }, []);

  // Save-as-playlist: a name prompt in a popover (the panel's compact take on
  // the sibling create-playlist forms), snapshotting the whole queue.
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const createWithTracks = useCreatePlaylistWithTracksMutation();

  const onSaveFormOpenChange = useCallback((open: boolean) => {
    setShowSaveForm(open);
    if (!open) setSaveName('');
  }, []);

  const onSaveAsPlaylist = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    // Create isn't idempotent — a double Enter/click would otherwise make two
    // playlists. Block re-entry while the mutation is in flight.
    if (createWithTracks.isPending) return;

    const trackIds = queueRef.current.map(track => track.id);
    try {
      const playlist = await createWithTracks.mutateAsync({ name, trackIds });
      setShowSaveForm(false);
      setSaveName('');
      toast.success(
        tToast('createdPlaylistAddedTracks', {
          name: playlist?.name ?? name,
          count: trackIds.length,
        })
      );
    } catch {
      toast.error(tToast('failedCreatePlaylist'));
    }
  }, [saveName, createWithTracks, tToast]);

  const onSaveNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') void onSaveAsPlaylist();
      if (e.key === 'Escape') onSaveFormOpenChange(false);
    },
    [onSaveAsPlaylist, onSaveFormOpenChange]
  );

  return {
    t,
    tCommon,
    headerAction,
    hasQueue: queue.length > 0,
    nowPlayingTrack: currentTrack && queueIndex >= 0 ? currentTrack : null,
    isPlaying,
    queueIndex,
    upNextRows,
    sortableIds,
    activeTrack,
    sensors,
    showClearConfirm,
    onClearConfirmOpenChange: setShowClearConfirm,
    onConfirmClear,
    onCancelClear,
    showSaveForm,
    onSaveFormOpenChange,
    saveName,
    onSaveNameChange: setSaveName,
    onSaveNameKeyDown,
    isSavingPlaylist: createWithTracks.isPending,
    canSavePlaylist: saveName.trim().length > 0 && !createWithTracks.isPending,
    onSaveAsPlaylist,
    onPlayIndex,
    onRemove,
    onDragStart,
    onDragEnd,
    onDragCancel,
  };
}
