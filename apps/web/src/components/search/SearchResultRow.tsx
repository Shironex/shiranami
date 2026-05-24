import { useTranslation } from 'react-i18next';
import { Download, Check, AlertCircle, Loader2, Music, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatViewCount } from '@/lib/formatViewCount';
import { formatDuration } from '@shiranami/shared';
import type { SearchResult } from '@/types/electron';
import type { DownloadState } from '@/hooks/useSearch';

interface SearchResultRowProps {
  result: SearchResult;
  downloadState: DownloadState;
  previewLoadingId: string | null;
  isPreviewPlaying: (result: SearchResult) => boolean;
  onPreview: (result: SearchResult) => void;
  onDownload: (result: SearchResult) => void;
}

export function SearchResultRow({
  result,
  downloadState: dlState,
  previewLoadingId,
  isPreviewPlaying,
  onPreview,
  onDownload,
}: SearchResultRowProps) {
  const { t } = useTranslation('search');

  const isDownloading = dlState.status === 'downloading' || dlState.status === 'converting';
  const isDone = dlState.status === 'done';
  const isError = dlState.status === 'error';

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition-colors relative overflow-hidden">
      {isDownloading && (
        <div
          className="absolute inset-0 bg-primary/5 transition-all duration-300"
          role="progressbar"
          aria-valuenow={dlState.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ width: `${dlState.progress}%` }}
        />
      )}

      <button
        onClick={() => onPreview(result)}
        className="w-11 h-11 rounded-lg overflow-hidden bg-muted shrink-0 relative z-10 group/thumb"
        title={isPreviewPlaying(result) ? t('pausePreview') : t('preview')}
        aria-label={isPreviewPlaying(result) ? t('pausePreview') : t('preview')}
      >
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
            isPreviewPlaying(result) ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'
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
      </button>

      <div className="flex-1 min-w-0 relative z-10">
        <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {result.uploader}
          {result.view_count != null &&
            (() => {
              const { key, count } = formatViewCount(result.view_count);
              return <span className="text-muted-foreground/50"> · {t(key, { count })}</span>;
            })()}
        </p>
      </div>

      <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
        {formatDuration(result.duration)}
      </span>

      <div className="shrink-0 relative z-10 w-9">
        {isDone ? (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-green-400">
            <Check className="w-4 h-4" />
          </div>
        ) : isDownloading ? (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <button
            onClick={() => onDownload(result)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
            title={dlState.error ?? t('retryDownload')}
          >
            <AlertCircle className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => onDownload(result)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
            title={t('download')}
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
