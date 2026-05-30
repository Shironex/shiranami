import { useState, useEffect, useCallback, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaylistImportStore, type PlaylistTrackStatus } from '@/stores/usePlaylistImportStore';
import { useTrackImport } from '@/hooks/useTrackImport';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { queryClient } from '@/lib/queryClient';
import { playlistKeys } from '@/hooks/queries/usePlaylists';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import type { DownloadProgress } from '@/types/electron';

export function usePlaylistImport() {
  const [extractError, setExtractError] = useState<string | null>(null);
  const activeImportTrackIdRef = useRef<string | null>(null);
  const activeImportTrackUrlRef = useRef<string | null>(null);

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

  // Shared hooks
  const { importTrack } = useTrackImport();
  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview(
    i18n.t('previewAlbum', { ns: 'import' })
  );

  // Listen to download progress events
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onProgress((data: DownloadProgress) => {
      const statusMap: Record<string, PlaylistTrackStatus> = {
        downloading: 'downloading',
        converting: 'converting',
        done: 'done',
        error: 'error',
      };
      const mapped = statusMap[data.status] ?? 'downloading';
      if (!activeImportTrackIdRef.current || data.url !== activeImportTrackUrlRef.current) {
        return;
      }
      if (mapped === 'downloading' || mapped === 'converting') {
        updateTrackStatus(activeImportTrackIdRef.current, mapped, data.progress);
      }
    });
    return cleanup;
  }, [updateTrackStatus]);

  // Listen to Spotify extraction progress
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
   * Shared import loop for both "import all" and "import selected". Downloads +
   * imports each pending track in playlist order, recording each resolved DB
   * track id (newly imported or already-present duplicate) so the source
   * playlist's order can be recreated afterwards. When `createPlaylist` is on
   * and a `sourceTitle` exists, a real Shiranami playlist is created from the
   * imported tracks via the existing `createWithTracks` IPC.
   */
  const runImport = useCallback(
    async (selectedIds: Set<string> | null) => {
      if (!IS_ELECTRON) return;
      startImporting(selectedIds ?? undefined);

      const currentTracks = usePlaylistImportStore.getState().tracks;
      const completedUrls = new Set<string>();
      // Resolved DB track ids in playlist order (for source-playlist recreation).
      const orderedTrackIds: string[] = [];
      const seenTrackIds = new Set<string>();
      const recordId = (id: string | null | undefined) => {
        if (id && !seenTrackIds.has(id)) {
          seenTrackIds.add(id);
          orderedTrackIds.push(id);
        }
      };

      for (const playlistTrack of currentTracks) {
        if (usePlaylistImportStore.getState().isCancelled) break;
        if (playlistTrack.status !== 'pending') continue;
        if (selectedIds && !selectedIds.has(playlistTrack.id)) continue;

        const trackId = playlistTrack.id;
        const trackUrl = playlistTrack.searchResult.webpage_url || playlistTrack.searchResult.url;
        if (completedUrls.has(trackUrl)) {
          updateTrackStatus(trackId, 'skipped');
          continue;
        }

        activeImportTrackIdRef.current = trackId;
        activeImportTrackUrlRef.current = trackUrl;
        updateTrackStatus(trackId, 'downloading', 0);

        try {
          const filePath = await window.electronAPI.downloader.download(trackUrl);

          const exists = await window.electronAPI.db.tracks.exists(filePath);
          if (exists) {
            // Duplicate: pull the existing library row so it still joins the
            // recreated playlist in order.
            const existing = useLibraryStore
              .getState()
              .library.find(libTrack => libTrack.filePath === filePath);
            recordId(existing?.id);
            completedUrls.add(trackUrl);
            updateTrackStatus(trackId, 'skipped');
            continue;
          }

          const imported = await importTrack(filePath);
          recordId(imported?.id);
          completedUrls.add(trackUrl);
          updateTrackStatus(trackId, 'done', 100);
        } catch (err) {
          const msg = err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
          updateTrackStatus(trackId, 'error', 0, msg);
        } finally {
          if (activeImportTrackIdRef.current === trackId) {
            activeImportTrackIdRef.current = null;
            activeImportTrackUrlRef.current = null;
          }
        }
      }

      activeImportTrackIdRef.current = null;
      activeImportTrackUrlRef.current = null;
      usePlaylistImportStore.setState({ isImporting: false });

      const cancelled = usePlaylistImportStore.getState().isCancelled;

      if (!cancelled) {
        const finalTracks = usePlaylistImportStore.getState().tracks;
        const scoped = selectedIds ? finalTracks.filter(t => selectedIds.has(t.id)) : finalTracks;
        const doneCount = scoped.filter(t => t.status === 'done').length;
        const skippedCount = scoped.filter(t => t.status === 'skipped').length;
        const errorCount = scoped.filter(t => t.status === 'error').length;

        toast.success(
          i18n.t('importSummary', {
            ns: 'toast',
            done: doneCount,
            skipped: skippedCount,
            errors: errorCount,
          })
        );
      } else {
        toast.info(i18n.t('importCancelled', { ns: 'toast' }));
      }

      // Recreate the source playlist (name + order). Runs even on cancel for
      // the tracks that did import, so a partial import still yields a playlist.
      const { createPlaylist, sourceTitle } = usePlaylistImportStore.getState();
      if (createPlaylist && sourceTitle && orderedTrackIds.length > 0) {
        try {
          await window.electronAPI.db.playlists.createWithTracks({
            name: sourceTitle,
            trackIds: orderedTrackIds,
          });
          queryClient.invalidateQueries({ queryKey: playlistKeys.all });
          toast.success(
            i18n.t('playlistCreated', {
              ns: 'toast',
              name: sourceTitle,
              count: orderedTrackIds.length,
            })
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
          toast.error(i18n.t('playlistCreateFailed', { ns: 'toast', error: msg }));
        }
      }
    },
    [startImporting, updateTrackStatus, importTrack]
  );

  const handleStartImport = useCallback(() => runImport(null), [runImport]);

  const handleStartImportSelected = useCallback(
    (selectedIds: Set<string>) => {
      if (selectedIds.size === 0) return Promise.resolve();
      return runImport(selectedIds);
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
    cancelImport();
    if (IS_ELECTRON) {
      window.electronAPI.playlist.cancel();
    }
  }, [cancelImport]);

  const handleReset = useCallback(() => {
    reset();
    setExtractError(null);
    activeImportTrackIdRef.current = null;
    activeImportTrackUrlRef.current = null;
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
