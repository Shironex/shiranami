import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaylistImport } from '@/hooks/usePlaylistImport';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { IPlaylistImportViewView } from './PlaylistImportView.types';

export function usePlaylistImportView(): IPlaylistImportViewView {
  const { t } = useTranslation('import');
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    url,
    setUrl,
    tracks,
    isExtracting,
    extractProgress,
    isImporting,
    extractError,
    previewLoadingId,
    sourceTitle,
    createPlaylist,
    setCreatePlaylist,
    processedCount,
    totalCount,
    pendingCount,
    overallProgress,
    hasResults,
    isFinished,
    handleExtract,
    handleKeyDown,
    handleStartImport,
    handleStartImportSelected,
    handleCancel,
    handleReset,
    handleRemoveTrack,
    handleRemoveTracks,
    isPreviewPlaying,
    handlePreview,
  } = usePlaylistImport();

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const hasSelection = selectedTrackIds.size > 0;

  const selectedPendingCount = hasSelection
    ? tracks.filter(track => selectedTrackIds.has(track.id) && track.status === 'pending').length
    : 0;

  const extractProgressPercent = extractProgress
    ? Math.round((extractProgress.current / extractProgress.total) * 100)
    : 0;

  const handleDownloadTrack = useCallback(
    (id: string) => {
      handleStartImportSelected(new Set([id]));
    },
    [handleStartImportSelected]
  );

  const onDownloadClick = useCallback(() => {
    if (hasSelection) {
      handleStartImportSelected(new Set(selectedTrackIds));
      clearSelection();
    } else {
      handleStartImport();
    }
  }, [
    hasSelection,
    selectedTrackIds,
    handleStartImportSelected,
    handleStartImport,
    clearSelection,
  ]);

  return {
    t,
    inputRef,
    url,
    setUrl,
    tracks,
    isExtracting,
    extractProgress,
    extractProgressPercent,
    isImporting,
    extractError,
    sourceTitle,
    createPlaylist,
    setCreatePlaylist,
    processedCount,
    totalCount,
    pendingCount,
    selectedPendingCount,
    overallProgress,
    isFinished,
    inputDisabled: isExtracting || isImporting,
    showExtractButton: !isExtracting && !isImporting && !hasResults,
    extractDisabled: !url.trim(),
    showFetchingProgress: isExtracting && extractProgress === null,
    hasResults,
    showDownloadButton: hasResults && !isImporting && !isFinished,
    showCancelButton: hasResults && isImporting,
    showProgressBlock: hasResults && (isImporting || isFinished),
    hasSelection,
    showCreatePlaylistOption: hasResults && sourceTitle !== null && !isImporting && !isFinished,
    showBulkActionBar: hasResults && hasSelection,
    rowProps: {
      tracks,
      isImporting,
      previewLoadingId,
      isPreviewPlaying,
      handlePreview,
      handleRemoveTrack,
      handleDownloadTrack,
    },
    handleExtract,
    handleKeyDown,
    handleCancel,
    handleReset,
    handleRemoveTracks,
    handleStartImportSelected,
    onDownloadClick,
  };
}
