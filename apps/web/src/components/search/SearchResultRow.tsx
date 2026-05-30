import { useTranslation } from 'react-i18next';
import { Loader2, Music, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatViewCount } from '@/lib/formatViewCount';
import { formatDuration } from '@shiranami/shared';
import { DownloadProgressButton } from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
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

  const downloadAriaLabel = isDownloading
    ? t('downloadingAria', { title: result.title })
    : isDone
      ? t('addedAria', { title: result.title })
      : isError
        ? t('retryDownloadAria', { title: result.title })
        : t('downloadAria', { title: result.title });

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
        {isDownloading ? (
          <p className="text-xs text-primary/70 truncate mt-0.5">{t('downloading')}</p>
        ) : isDone ? (
          <p className="text-xs text-emerald-400/80 truncate mt-0.5">{t('addedToLibrary')}</p>
        ) : isError ? (
          <p className="text-xs text-destructive/80 truncate mt-0.5">{t('downloadError')}</p>
        ) : (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {result.uploader}
            {result.view_count != null &&
              (() => {
                const { key, count } = formatViewCount(result.view_count);
                return <span className="text-muted-foreground/50"> · {t(key, { count })}</span>;
              })()}
          </p>
        )}
      </div>

      <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
        {formatDuration(result.duration)}
      </span>

      <div className="shrink-0 relative z-10">
        <DownloadProgressButton
          status={dlState.status}
          ariaLabel={downloadAriaLabel}
          title={isError ? (dlState.error ?? t('retryDownload')) : undefined}
          onDownload={() => onDownload(result)}
        />
      </div>

      {isDownloading && (
        <DownloadProgressBar
          progress={dlState.progress}
          className="rounded-b-xl"
          ariaLabel={t('downloadProgressAria')}
        />
      )}
    </div>
  );
}
