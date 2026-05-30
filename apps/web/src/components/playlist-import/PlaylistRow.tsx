import { Loader2, Check, AlertTriangle, Music, X, Play, Pause } from 'lucide-react';
import { type RowComponentProps } from 'react-window';
import { useTranslation } from 'react-i18next';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { DownloadProgressButton } from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
import { type PlaylistTrack, type PlaylistTrackStatus } from '@/stores/usePlaylistImportStore';

export interface PlaylistRowProps {
  tracks: PlaylistTrack[];
  isImporting: boolean;
  previewLoadingId: string | null;
  isPreviewPlaying: (result: { id: string }) => boolean;
  handlePreview: (result: PlaylistTrack['searchResult']) => void;
  handleRemoveTrack: (id: string) => void;
  handleDownloadTrack: (id: string) => void;
}

/** Maps a playlist track status onto the shared download-button status. */
function toDownloadStatus(status: PlaylistTrackStatus) {
  return status === 'pending' ? 'idle' : status;
}

function useStatusLabel() {
  const { t } = useTranslation('import');
  return (status: PlaylistTrackStatus): string => {
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
  };
}

export function PlaylistRow(props: RowComponentProps<PlaylistRowProps>) {
  const { t } = useTranslation('import');
  const statusLabel = useStatusLabel();
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

  const playlistTrack = tracks[index];

  const isSelected = useSelectionStore(s => s.selectedTrackIds.has(playlistTrack?.id ?? ''));
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const toggleTrack = useSelectionStore(s => s.toggleTrack);
  const selectRange = useSelectionStore(s => s.selectRange);
  const clearSelection = useSelectionStore(s => s.clearSelection);

  if (!playlistTrack) return null;

  const result = playlistTrack.searchResult;
  const isActive = playlistTrack.status === 'downloading' || playlistTrack.status === 'converting';

  const handleClick = (e: React.MouseEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    if (isMod) {
      e.preventDefault();
      toggleTrack(playlistTrack.id, index);
      return;
    }

    if (isShift) {
      e.preventDefault();
      selectRange(index, tracks);
      return;
    }

    // Plain click: if we have a selection, clear it; otherwise preview
    if (hasSelection) {
      clearSelection();
    } else {
      handlePreview(result);
    }
  };

  return (
    <div style={style} className="px-0.5">
      <div
        onClick={handleClick}
        className={cn(
          'group flex items-center gap-3 px-3 py-1.5 rounded-xl transition-colors relative overflow-hidden h-full cursor-pointer',
          isSelected ? 'bg-primary/[0.12] ring-1 ring-primary/20' : 'hover:bg-accent/50'
        )}
      >
        <span className="w-6 text-center text-xs text-muted-foreground/40 tabular-nums relative z-10">
          {index + 1}
        </span>

        <div
          onClick={e => {
            e.stopPropagation();
            if (hasSelection) {
              toggleTrack(playlistTrack.id, index);
            } else {
              handlePreview(result);
            }
          }}
          className={cn(
            'w-10 h-10 rounded-lg overflow-hidden shrink-0 relative z-10 group/thumb',
            isSelected ? 'bg-primary/20 flex items-center justify-center' : 'bg-muted'
          )}
        >
          {isSelected ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <>
              {result.thumbnail ? (
                <img
                  src={result.thumbnail}
                  alt={result.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
              <div
                className={cn(
                  'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity',
                  isPreviewPlaying(result)
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/thumb:opacity-100'
                )}
              >
                {previewLoadingId === result.id ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : isPreviewPlaying(result) ? (
                  <Pause className="w-4 h-4 text-white" />
                ) : (
                  <Play className="w-4 h-4 text-white" />
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 relative z-10">
          <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{result.uploader}</p>
            {result.matchFlag === 'low' && (
              <span
                className="flex items-center gap-1 text-[10px] font-medium text-amber-500 shrink-0"
                title={t('lowConfidenceHint')}
              >
                <AlertTriangle className="w-3 h-3" />
                {t('lowConfidence')}
              </span>
            )}
            {playlistTrack.status !== 'pending' && (
              <span
                className={cn(
                  'text-[10px] font-medium shrink-0',
                  playlistTrack.status === 'done' && 'text-green-400',
                  playlistTrack.status === 'error' && 'text-destructive',
                  playlistTrack.status === 'skipped' && 'text-muted-foreground/50',
                  (playlistTrack.status === 'downloading' ||
                    playlistTrack.status === 'converting') &&
                    'text-primary'
                )}
              >
                {statusLabel(playlistTrack.status)}
                {playlistTrack.status === 'error' && playlistTrack.error
                  ? `: ${playlistTrack.error}`
                  : ''}
              </span>
            )}
          </div>
        </div>

        <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
          {formatDuration(result.duration)}
        </span>

        <div className="shrink-0 relative z-10" onClick={e => e.stopPropagation()}>
          <DownloadProgressButton
            status={toDownloadStatus(playlistTrack.status)}
            ariaLabel={
              playlistTrack.status === 'error'
                ? (playlistTrack.error ?? t('retryDownloadTrack'))
                : statusLabel(playlistTrack.status)
            }
            disabled={isImporting}
            onDownload={() => handleDownloadTrack(playlistTrack.id)}
          />
        </div>

        {playlistTrack.status === 'pending' && !isImporting && (
          <button
            onClick={e => {
              e.stopPropagation();
              handleRemoveTrack(playlistTrack.id);
            }}
            className="shrink-0 relative z-10 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
            title={t('removeFromList')}
            aria-label={t('removeFromList')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {isActive && (
          <DownloadProgressBar
            progress={playlistTrack.progress}
            className="rounded-b-xl"
            ariaLabel={t('downloadProgressAria')}
          />
        )}
      </div>
    </div>
  );
}
