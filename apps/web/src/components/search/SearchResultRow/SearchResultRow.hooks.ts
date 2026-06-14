import { useTranslation } from 'react-i18next';
import { formatViewCount } from '@/lib/formatViewCount';
import { formatDuration } from '@shiranami/shared';
import type { ISearchResultRowProps, ISearchResultRowView } from './SearchResultRow.types';

export function useSearchResultRow({
  result,
  downloadState,
  previewLoadingId,
  isPreviewPlaying,
  onPreview,
  onDownload,
}: ISearchResultRowProps): ISearchResultRowView {
  const { t } = useTranslation('search');

  const isDownloading =
    downloadState.status === 'downloading' || downloadState.status === 'converting';
  const isDone = downloadState.status === 'done';
  const isError = downloadState.status === 'error';

  const isPreviewActive = isPreviewPlaying(result);
  const isPreviewLoading = previewLoadingId === result.id;

  let downloadAriaLabel: string;
  if (isDownloading) downloadAriaLabel = t('downloadingAria', { title: result.title });
  else if (isDone) downloadAriaLabel = t('addedAria', { title: result.title });
  else if (isError) downloadAriaLabel = t('retryDownloadAria', { title: result.title });
  else downloadAriaLabel = t('downloadAria', { title: result.title });

  const showViewCount = result.view_count != null;
  let viewCountLabel = '';
  if (result.view_count != null) {
    const { key, count } = formatViewCount(result.view_count);
    viewCountLabel = ` · ${t(key, { count })}`;
  }

  return {
    isDownloading,
    isDone,
    isError,
    isPreviewActive,
    isPreviewLoading,
    showThumbnail: Boolean(result.thumbnail),
    previewLabel: isPreviewActive ? t('pausePreview') : t('preview'),
    downloadingLabel: t('downloading'),
    addedLabel: t('addedToLibrary'),
    errorLabel: t('downloadError'),
    downloadAriaLabel,
    downloadTitle: isError ? (downloadState.error ?? t('retryDownload')) : undefined,
    showViewCount,
    viewCountLabel,
    durationLabel: formatDuration(result.duration),
    progressAriaLabel: t('downloadProgressAria'),
    downloadButtonClassName:
      downloadState.status === 'idle' ? 'opacity-0 group-hover:opacity-100' : undefined,
    onPreviewClick: () => onPreview(result),
    onDownloadClick: () => onDownload(result),
  };
}
