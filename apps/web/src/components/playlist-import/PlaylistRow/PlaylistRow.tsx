import { Loader2, Check, AlertTriangle, Music, X, Play, Pause } from 'lucide-react';
import { type RowComponentProps } from 'react-window';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { DownloadProgressButton } from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
import { usePlaylistRow } from './PlaylistRow.hooks';
import type { IPlaylistRowProps } from './PlaylistRow.types';

export default function PlaylistRow(props: RowComponentProps<IPlaylistRowProps>) {
  const {
    track,
    style,
    displayIndex,
    isSelected,
    isActive,
    downloadStatus,
    statusLabel,
    statusBadgeClass,
    errorSuffix,
    showStatusBadge,
    isLowConfidence,
    isPreviewing,
    isPreviewLoading,
    downloadButtonLabel,
    downloadButtonTitle,
    downloadButtonDisabled,
    canRemove,
    removeLabel,
    lowConfidenceHint,
    lowConfidenceLabel,
    progressAriaLabel,
    onRowClick,
    onThumbnailClick,
    onRemove,
    onDownload,
  } = usePlaylistRow(props);

  if (!track) return null;

  const result = track.searchResult;

  return (
    <div style={style} className="px-0.5">
      <div
        onClick={onRowClick}
        className={cn(
          'group flex items-center gap-3 px-3 py-1.5 rounded-xl transition-colors relative overflow-hidden h-full cursor-pointer',
          isSelected
            ? 'bg-primary/[0.12] ring-1 ring-primary/20'
            : isActive
              ? 'bg-primary/[0.04]'
              : 'hover:bg-accent/50'
        )}
      >
        <span className="w-6 text-center text-xs text-muted-foreground/40 tabular-nums relative z-10">
          {displayIndex}
        </span>

        <div
          onClick={onThumbnailClick}
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
                  isPreviewing ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'
                )}
              >
                {isPreviewLoading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : isPreviewing ? (
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
            {isLowConfidence && (
              <span
                className="flex items-center gap-1 text-[10px] font-medium text-warning shrink-0"
                title={lowConfidenceHint}
              >
                <AlertTriangle className="w-3 h-3" />
                {lowConfidenceLabel}
              </span>
            )}
            {showStatusBadge && (
              <span className={cn('text-[10px] font-medium shrink-0', statusBadgeClass)}>
                {statusLabel}
                {errorSuffix}
              </span>
            )}
          </div>
        </div>

        <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
          {formatDuration(result.duration)}
        </span>

        <div className="shrink-0 relative z-10" onClick={event => event.stopPropagation()}>
          <DownloadProgressButton
            status={downloadStatus}
            ariaLabel={downloadButtonLabel}
            title={downloadButtonTitle}
            disabled={downloadButtonDisabled}
            onDownload={onDownload}
          />
        </div>

        {canRemove && (
          <button
            onClick={event => {
              event.stopPropagation();
              onRemove();
            }}
            className="focus-ring shrink-0 relative z-10 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            title={removeLabel}
            aria-label={removeLabel}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {isActive && (
          <DownloadProgressBar
            progress={track.progress}
            className="rounded-b-xl"
            ariaLabel={progressAriaLabel}
          />
        )}
      </div>
    </div>
  );
}
