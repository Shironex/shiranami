import { useTranslation } from 'react-i18next';
import { type RowComponentProps } from 'react-window';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { cn } from '@/lib/utils';
import type { DownloadStatus } from '@/components/shared/DownloadProgressButton';
import { type PlaylistTrack, type PlaylistTrackStatus } from '@/stores/usePlaylistImportStore';
import type { IPlaylistRowProps, IPlaylistRowView } from './PlaylistRow.types';

/** Maps a playlist track status onto the shared download-button status. */
function toDownloadStatus(status: PlaylistTrackStatus): DownloadStatus {
  return status === 'pending' ? 'idle' : status;
}

/** Resolve the localized status label for a track lifecycle status. */
function resolveStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: PlaylistTrackStatus
): string {
  switch (status) {
    case 'downloading':
      return t('statusDownloading');
    case 'converting':
      return t('statusConverting');
    case 'done':
      return t('statusDone');
    case 'error':
      return t('statusFailed');
    case 'skipped':
      return t('statusAlreadyInLibrary');
    default:
      return t('statusWaiting');
  }
}

export function usePlaylistRow(props: RowComponentProps<IPlaylistRowProps>): IPlaylistRowView {
  const { t } = useTranslation('import');
  const {
    index,
    style,
    tracks,
    isImporting,
    previewLoadingId,
    isPreviewPlaying,
    handlePreview,
    handleRemoveTrack,
    handleDownloadTrack,
  } = props;

  const track: PlaylistTrack | null = tracks[index] ?? null;

  const isSelected = useSelectionStore(s => s.selectedTrackIds.has(track?.id ?? ''));
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const toggleTrack = useSelectionStore(s => s.toggleTrack);
  const selectRange = useSelectionStore(s => s.selectRange);
  const clearSelection = useSelectionStore(s => s.clearSelection);

  const result = track?.searchResult ?? null;
  const status = track?.status ?? 'pending';
  const isActive = status === 'downloading' || status === 'converting';
  const isPreviewing = result ? isPreviewPlaying(result) : false;
  const isPreviewLoading = result ? previewLoadingId === result.id : false;
  const statusLabel = resolveStatusLabel(t, status);
  const errorSuffix = status === 'error' && track?.error ? `: ${track.error}` : '';

  const statusBadgeClass = cn(
    status === 'done' && 'text-success',
    status === 'error' && 'text-destructive',
    status === 'skipped' && 'text-muted-foreground/50',
    isActive && 'text-primary'
  );

  const onRowClick = (event: React.MouseEvent): void => {
    if (!track || !result) return;
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod) {
      event.preventDefault();
      toggleTrack(track.id, index);
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectRange(index, tracks);
      return;
    }
    // Plain click: clear an existing selection, otherwise preview.
    if (hasSelection) {
      clearSelection();
    } else {
      handlePreview(result);
    }
  };

  const onThumbnailClick = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (!track || !result) return;
    if (hasSelection) {
      toggleTrack(track.id, index);
    } else {
      handlePreview(result);
    }
  };

  return {
    track,
    style,
    displayIndex: index + 1,
    isSelected,
    isActive,
    downloadStatus: toDownloadStatus(status),
    statusLabel,
    statusBadgeClass,
    errorSuffix,
    showStatusBadge: status !== 'pending',
    isLowConfidence: result?.matchFlag === 'low',
    isPreviewing,
    isPreviewLoading,
    downloadButtonLabel: status === 'error' ? t('retryDownloadTrack') : statusLabel,
    downloadButtonTitle: status === 'error' ? track?.error : undefined,
    downloadButtonDisabled: isImporting,
    canRemove: status === 'pending' && !isImporting,
    removeLabel: t('removeFromList'),
    lowConfidenceHint: t('lowConfidenceHint'),
    lowConfidenceLabel: t('lowConfidence'),
    progressAriaLabel: t('downloadProgressAria'),
    onRowClick,
    onThumbnailClick,
    onRemove: () => track && handleRemoveTrack(track.id),
    onDownload: () => track && handleDownloadTrack(track.id),
  };
}
