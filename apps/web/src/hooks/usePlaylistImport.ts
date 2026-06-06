import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaylistImportStore, type PlaylistTrackStatus } from '@/stores/usePlaylistImportStore';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import { useDownloadBatchStore } from '@/stores/useDownloadBatchStore';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import i18n from '@/lib/i18n';
import type { DownloadQueueStatus } from '@shiranami/contracts';

/** Stable url key for a playlist track (matches the queue enqueue key). */
function trackUrl(searchResult: { webpage_url?: string; url?: string }): string {
  return searchResult.webpage_url || searchResult.url || '';
}

/** Map the main-queue lifecycle status onto the playlist row's display status. */
function mapQueueStatus(status: DownloadQueueStatus): PlaylistTrackStatus {
  switch (status) {
    case 'queued':
    case 'active':
      return 'downloading';
    case 'converting':
      return 'converting';
    case 'done':
      return 'done';
    case 'error':
    case 'canceled':
      return 'error';
  }
}

export function usePlaylistImport() {
  const [extractError, setExtractError] = useState<string | null>(null);

  // Store selectors
  const url = usePlaylistImportStore(s => s.url);
  const setUrl = usePlaylistImportStore(s => s.setUrl);
  const tracks = usePlaylistImportStore(s => s.tracks);
  const isExtracting = usePlaylistImportStore(s => s.isExtracting);
  const importingTrackIds = usePlaylistImportStore(s => s.importingTrackIds);
  const extractProgress = usePlaylistImportStore(s => s.extractProgress);
  const isImporting = usePlaylistImportStore(s => s.isImporting);
  const setTracks = usePlaylistImportStore(s => s.setTracks);
  const sourceTitle = usePlaylistImportStore(s => s.sourceTitle);
  const createPlaylist = usePlaylistImportStore(s => s.createPlaylist);
  const setCreatePlaylist = usePlaylistImportStore(s => s.setCreatePlaylist);
  const removeTrack = usePlaylistImportStore(s => s.removeTrack);
  const removeTracks = usePlaylistImportStore(s => s.removeTracks);
  const updateTrackStatus = usePlaylistImportStore(s => s.updateTrackStatus);
  const startExtracting = usePlaylistImportStore(s => s.startExtracting);
  const stopExtracting = usePlaylistImportStore(s => s.stopExtracting);
  const setExtractProgress = usePlaylistImportStore(s => s.setExtractProgress);
  const startImporting = usePlaylistImportStore(s => s.startImporting);
  const cancelImport = usePlaylistImportStore(s => s.cancelImport);
  const reset = usePlaylistImportStore(s => s.reset);

  // Live queue mirror — drives per-row display status (the actual import is
  // owned by the App-level batch coordinator so it survives navigating away).
  const byUrl = useDownloadQueueStore(s => s.byUrl);

  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview(
    i18n.t('previewAlbum', { ns: 'import' })
  );

  // Project queue status onto the display store while the view is mounted, and
  // flip `isImporting` off once every track in the active batch is terminal.
  // The batch id lives in the store (not a component-local ref), so this runs
  // correctly on remount — the progress and counter survive navigating away to
  // the Downloads view and back.
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const state = usePlaylistImportStore.getState();
    if (!state.isImporting) return;

    const batchId = state.activeBatchId;
    if (!batchId) return;

    // Finished-while-away reconcile: the App-level coordinator removes a batch
    // once it has imported every track (and recreated the playlist). If our
    // batch is gone, the import completed while this view was unmounted and the
    // queue may already be cleared — settle into a finished state rather than
    // leaving rows stuck mid-flight.
    if (!(batchId in useDownloadBatchStore.getState().batches)) {
      usePlaylistImportStore.setState(s => ({
        isImporting: false,
        tracks: s.tracks.map(track =>
          track.status === 'downloading' || track.status === 'converting'
            ? { ...track, status: 'done', progress: 100 }
            : track
        ),
      }));
      return;
    }

    let sawAny = false;
    let anyActive = false;
    for (const track of state.tracks) {
      const item = byUrl.get(trackUrl(track.searchResult));
      if (!item || item.batchId !== batchId) continue;
      sawAny = true;
      const mapped = mapQueueStatus(item.status);
      const isTerminal =
        item.status === 'done' || item.status === 'error' || item.status === 'canceled';
      if (!isTerminal) anyActive = true;
      if (track.status !== mapped) {
        updateTrackStatus(track.id, mapped, mapped === 'done' ? 100 : item.progress);
      }
    }

    // Only conclude the import is finished once we've actually observed this
    // batch's items in the snapshot. An empty match set means the enqueues
    // haven't reached the queue yet (async IPC) — not that every track is done;
    // flipping `isImporting` here would latch a premature "finished" state.
    if (sawAny && !anyActive) {
      usePlaylistImportStore.setState({ isImporting: false });
    }
  }, [byUrl, updateTrackStatus]);

  // Spotify extraction progress (unchanged — pre-download phase).
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.playlist.onExtractProgress(data => {
      setExtractProgress(data);
    });
    return cleanup;
  }, [setExtractProgress]);

  const handleExtract = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed || !IS_ELECTRON) return;

    setExtractError(null);
    startExtracting();

    try {
      const { title, tracks: results } = await window.electronAPI.playlist.extract(trimmed);
      if (results.length === 0) {
        setExtractError(i18n.t('noTracksFound', { ns: 'import' }));
        stopExtracting();
        return;
      }
      setTracks(results, title);
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('noTracksFound', { ns: 'import' });
      setExtractError(msg);
      stopExtracting();
    }
  }, [url, startExtracting, stopExtracting, setTracks]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleExtract();
      }
    },
    [handleExtract]
  );

  const handleRemoveTrack = useCallback(
    (id: string) => {
      removeTrack(id);
    },
    [removeTrack]
  );

  /**
   * Batch-enqueue every pending (and selected, if scoped) track into the
   * download queue, carrying a shared `batchId` + per-track `batchIndex` (its
   * position within this enqueued batch — for a selective import this is the
   * index within the selection, not the source playlist position). The batch
   * metadata is registered in the app-level batch
   * store so the App-level coordinator imports the downloaded tracks in source
   * order and recreates the playlist once the batch drains — even if the user
   * navigates away from this view while downloads run.
   */
  const runImport = useCallback(
    (selectedIds: Set<string> | null) => {
      if (!IS_ELECTRON) return;

      const currentTracks = usePlaylistImportStore.getState().tracks;
      const pending = currentTracks.filter(
        t => t.status === 'pending' && (!selectedIds || selectedIds.has(t.id))
      );
      if (pending.length === 0) return;

      const batchId = crypto.randomUUID();
      startImporting(selectedIds ?? undefined, batchId);

      const { createPlaylist: create, sourceTitle: title } = usePlaylistImportStore.getState();

      const batchStore = useDownloadBatchStore.getState();
      batchStore.registerBatch({ batchId, sourceTitle: title, createPlaylist: create });

      // Enqueue every pending track, capturing each resulting item id; seal the
      // batch only once every enqueue has settled so the coordinator's
      // completion gate uses the actually-enqueued set (reject-safe).
      const enqueues = pending.map((track, index) => {
        updateTrackStatus(track.id, 'downloading', 0);
        return window.electronAPI.downloader
          .enqueueDownload({
            url: trackUrl(track.searchResult),
            youtubeId: track.searchResult.id,
            title: track.searchResult.title,
            thumbnail: track.searchResult.thumbnail,
            batchId,
            batchIndex: index,
            // Batch intent persisted per-item so a mid-import restart can
            // reconstruct this batch and still recreate the playlist.
            batchSourceTitle: title,
            batchCreatePlaylist: create,
          })
          .then(itemId => {
            useDownloadBatchStore.getState().addEnqueuedId(batchId, itemId);
          })
          .catch(() => {
            // Enqueue rejected (e.g. non-http url): this track never enters the
            // queue, so its id is absent from the batch membership. Mark the row
            // errored to correct the optimistic 'downloading' above — otherwise
            // the finished-while-away reconcile would later promote a track that
            // never downloaded to 'done'.
            updateTrackStatus(track.id, 'error');
          });
      });

      void Promise.allSettled(enqueues).then(() => {
        useDownloadBatchStore.getState().sealBatch(batchId);
      });
    },
    [startImporting, updateTrackStatus]
  );

  const handleStartImport = useCallback(() => runImport(null), [runImport]);

  const handleStartImportSelected = useCallback(
    (selectedIds: Set<string>) => {
      if (selectedIds.size === 0) return;
      runImport(selectedIds);
    },
    [runImport]
  );

  const handleRemoveTracks = useCallback(
    (ids: Set<string>) => {
      removeTracks(ids);
    },
    [removeTracks]
  );

  const handleCancel = useCallback(() => {
    // Capture the active batch id before cancelImport() clears it, so we can
    // still cancel this batch's in-flight queue items below.
    const batchId = usePlaylistImportStore.getState().activeBatchId;
    cancelImport();
    if (!IS_ELECTRON) return;
    // Stop the Spotify extraction phase if it's still running.
    window.electronAPI.playlist.cancel();
    // Cancel every still-running queue item in this batch.
    if (!batchId) return;
    const { items } = useDownloadQueueStore.getState();
    for (const item of items) {
      if (item.batchId !== batchId) continue;
      if (item.status === 'queued' || item.status === 'active' || item.status === 'converting') {
        window.electronAPI.downloader.cancelDownload(item.id).catch(() => {});
      }
    }
  }, [cancelImport]);

  const handleReset = useCallback(() => {
    reset();
    setExtractError(null);
  }, [reset]);

  // Computed values — scoped to importingTrackIds when doing a selective import
  const scopedTracks = importingTrackIds ? tracks.filter(t => importingTrackIds.has(t.id)) : tracks;
  const processedCount = scopedTracks.filter(
    t => t.status === 'done' || t.status === 'skipped' || t.status === 'error'
  ).length;
  const totalCount = scopedTracks.length;
  const overallProgress = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const pendingCount = tracks.filter(t => t.status === 'pending').length;
  const hasResults = tracks.length > 0;
  const isFinished = hasResults && !isImporting && pendingCount === 0;

  return {
    // State
    url,
    tracks,
    isExtracting,
    extractProgress,
    isImporting,
    extractError,
    previewLoadingId,
    sourceTitle,
    createPlaylist,
    setCreatePlaylist,

    // Computed
    processedCount,
    totalCount,
    pendingCount,
    overallProgress,
    hasResults,
    isFinished,

    // Actions
    setUrl,
    handleExtract,
    handleKeyDown,
    handleStartImport,
    handleStartImportSelected,
    handleCancel,
    handleReset,
    handleRemoveTrack,
    handleRemoveTracks,

    // Preview
    isPreviewPlaying,
    handlePreview,
  };
}
