import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import {
  usePlaylistImportStore,
  type PlaylistTrackStatus,
} from '@/stores/usePlaylistImportStore';
import { useTrackImport } from '@/hooks/useTrackImport';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { toast } from 'sonner';
import type { DownloadProgress } from '@/types/electron';

export function usePlaylistImport() {
  const [extractError, setExtractError] = useState<string | null>(null);

  // Store selectors
  const url = usePlaylistImportStore((s) => s.url);
  const setUrl = usePlaylistImportStore((s) => s.setUrl);
  const tracks = usePlaylistImportStore((s) => s.tracks);
  const isExtracting = usePlaylistImportStore((s) => s.isExtracting);
  const extractProgress = usePlaylistImportStore((s) => s.extractProgress);
  const isImporting = usePlaylistImportStore((s) => s.isImporting);
  const setTracks = usePlaylistImportStore((s) => s.setTracks);
  const removeTrack = usePlaylistImportStore((s) => s.removeTrack);
  const updateTrackStatus = usePlaylistImportStore((s) => s.updateTrackStatus);
  const startExtracting = usePlaylistImportStore((s) => s.startExtracting);
  const stopExtracting = usePlaylistImportStore((s) => s.stopExtracting);
  const setExtractProgress = usePlaylistImportStore((s) => s.setExtractProgress);
  const startImporting = usePlaylistImportStore((s) => s.startImporting);
  const cancelImport = usePlaylistImportStore((s) => s.cancelImport);
  const reset = usePlaylistImportStore((s) => s.reset);

  // Shared hooks
  const { importTrack } = useTrackImport();
  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview('Playlist Import');

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
      if (mapped === 'downloading' || mapped === 'converting') {
        updateTrackStatus(data.url, mapped, data.progress);
      }
    });
    return cleanup;
  }, [updateTrackStatus]);

  // Listen to Spotify extraction progress
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.playlist.onExtractProgress((data) => {
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
      const results = await window.electronAPI.playlist.extract(trimmed);
      if (results.length === 0) {
        setExtractError('No tracks found in this playlist. It may be empty or private.');
        stopExtracting();
        return;
      }
      setTracks(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract playlist';
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

  const handleStartImport = useCallback(async () => {
    if (!IS_ELECTRON) return;
    startImporting();

    const currentTracks = usePlaylistImportStore.getState().tracks;

    for (const playlistTrack of currentTracks) {
      if (usePlaylistImportStore.getState().isCancelled) break;
      if (playlistTrack.status !== 'pending') continue;

      const trackUrl = playlistTrack.searchResult.webpage_url || playlistTrack.searchResult.url;

      updateTrackStatus(trackUrl, 'downloading', 0);

      try {
        const filePath = await window.electronAPI.downloader.download(trackUrl);

        const exists = await window.electronAPI.db.tracks.exists(filePath);
        if (exists) {
          updateTrackStatus(trackUrl, 'skipped');
          continue;
        }

        await importTrack(filePath);
        updateTrackStatus(trackUrl, 'done', 100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Download failed';
        updateTrackStatus(trackUrl, 'error', 0, msg);
      }
    }

    usePlaylistImportStore.setState({ isImporting: false });

    if (!usePlaylistImportStore.getState().isCancelled) {
      const finalTracks = usePlaylistImportStore.getState().tracks;
      const doneCount = finalTracks.filter((t) => t.status === 'done').length;
      const skippedCount = finalTracks.filter((t) => t.status === 'skipped').length;
      const errorCount = finalTracks.filter((t) => t.status === 'error').length;

      let message = `Imported ${doneCount} track${doneCount !== 1 ? 's' : ''}`;
      if (skippedCount > 0) message += `, ${skippedCount} already in library`;
      if (errorCount > 0) message += `, ${errorCount} failed`;

      toast.success(message);
    } else {
      toast.info('Playlist import cancelled');
    }
  }, [startImporting, updateTrackStatus, importTrack]);

  const handleCancel = useCallback(() => {
    cancelImport();
    if (IS_ELECTRON) {
      window.electronAPI.playlist.cancel();
    }
  }, [cancelImport]);

  const handleReset = useCallback(() => {
    reset();
    setExtractError(null);
  }, [reset]);

  // Computed values
  const completedCount = tracks.filter(
    (t) => t.status === 'done' || t.status === 'skipped'
  ).length;
  const totalCount = tracks.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pendingCount = tracks.filter((t) => t.status === 'pending').length;
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

    // Computed
    completedCount,
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
    handleCancel,
    handleReset,
    handleRemoveTrack,

    // Preview
    isPreviewPlaying,
    handlePreview,
  };
}
