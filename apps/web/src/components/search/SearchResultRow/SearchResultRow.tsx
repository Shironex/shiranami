import { Loader2, Music, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DownloadProgressButton } from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
import { useSearchResultRow } from './SearchResultRow.hooks';
import type { ISearchResultRowProps } from './SearchResultRow.types';

export default function SearchResultRow(props: ISearchResultRowProps) {
  const { result, downloadState } = props;
  const {
    isDownloading,
    isDone,
    isError,
    isPreviewActive,
    isPreviewLoading,
    showThumbnail,
    previewLabel,
    downloadingLabel,
    addedLabel,
    errorLabel,
    downloadAriaLabel,
    downloadTitle,
    showViewCount,
    viewCountLabel,
    durationLabel,
    progressAriaLabel,
    downloadButtonClassName,
    onPreviewClick,
    onDownloadClick,
  } = useSearchResultRow(props);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors relative overflow-hidden',
        isDownloading
          ? 'bg-primary/[0.04]'
          : isDone
            ? 'border border-emerald-400/15'
            : 'hover:bg-accent/50'
      )}
    >
      <button
        onClick={onPreviewClick}
        className="w-11 h-11 rounded-lg overflow-hidden bg-muted shrink-0 relative z-10 group/thumb"
        title={previewLabel}
        aria-label={previewLabel}
      >
        {showThumbnail ? (
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
            isPreviewActive ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'
          )}
        >
          {isPreviewLoading ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : isPreviewActive ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white" />
          )}
        </div>
      </button>

      <div className="flex-1 min-w-0 relative z-10">
        <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
        {isDownloading ? (
          <p className="text-xs text-primary/70 truncate mt-0.5">{downloadingLabel}</p>
        ) : isDone ? (
          <p className="text-xs text-emerald-400/80 truncate mt-0.5">{addedLabel}</p>
        ) : isError ? (
          <p className="text-xs text-destructive/80 truncate mt-0.5">{errorLabel}</p>
        ) : (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {result.uploader}
            {showViewCount && <span className="text-muted-foreground/50">{viewCountLabel}</span>}
          </p>
        )}
      </div>

      <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
        {durationLabel}
      </span>

      <div className="shrink-0 relative z-10">
        <DownloadProgressButton
          status={downloadState.status}
          ariaLabel={downloadAriaLabel}
          title={downloadTitle}
          onDownload={onDownloadClick}
          className={downloadButtonClassName}
        />
      </div>

      {isDownloading && (
        <DownloadProgressBar
          progress={downloadState.progress}
          className="rounded-b-xl"
          ariaLabel={progressAriaLabel}
        />
      )}
    </div>
  );
}
