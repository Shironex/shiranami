import { useRef, useCallback } from 'react';
import { Link, Loader2, AlertCircle, X, Download, ListMusic } from 'lucide-react';
import { ViewEmptyState } from '../shared/ViewEmptyState';
import { List } from 'react-window';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { usePlaylistImport } from '@/hooks/usePlaylistImport';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { PlaylistRow } from './PlaylistRow';
import { ImportBulkActionBar } from './ImportBulkActionBar';

export function PlaylistImportView() {
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
    ? tracks.filter(t => selectedTrackIds.has(t.id) && t.status === 'pending').length
    : 0;

  const handleDownloadTrack = useCallback(
    (id: string) => {
      handleStartImportSelected(new Set([id]));
    },
    [handleStartImportSelected]
  );

  const handleDownloadClick = useCallback(() => {
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Link className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('urlPlaceholder')}
            disabled={isExtracting || isImporting}
            className={cn(
              'h-auto w-full pl-10 pr-24 py-2.5 rounded-xl text-sm bg-card border-border/50',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus-visible:ring-primary/40 focus-visible:border-primary/40',
              'shadow-none'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isExtracting && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            {!isExtracting && !isImporting && !hasResults && (
              <button
                onClick={handleExtract}
                disabled={!url.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('extract')}
              </button>
            )}
          </div>
        </div>

        {/* Extraction progress for Spotify */}
        {isExtracting && extractProgress && (
          <div className="mt-3 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">
                {t('resolvingTrack', {
                  current: extractProgress.current,
                  total: extractProgress.total,
                  name: extractProgress.trackName,
                })}
              </span>
            </div>
            <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((extractProgress.current / extractProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Extraction progress for YouTube */}
        {isExtracting && !extractProgress && (
          <div className="mt-3 max-w-2xl flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>{t('fetching')}</span>
          </div>
        )}

        {/* Error state */}
        {extractError && (
          <div className="mt-3 max-w-2xl flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{extractError}</span>
          </div>
        )}

        {/* Action bar when tracks are loaded */}
        {hasResults && (
          <div className="mt-3 max-w-2xl flex items-center gap-3">
            {!isImporting && !isFinished && (
              <button
                onClick={handleDownloadClick}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                {hasSelection
                  ? t('downloadSelected', { count: selectedPendingCount })
                  : t('downloadAll', { count: pendingCount })}
              </button>
            )}
            {isImporting && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <X className="w-4 h-4" />
                {t('cancel')}
              </button>
            )}
            {(isImporting || isFinished) && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t('processed', { done: processedCount, total: totalCount })}</span>
                  {isImporting && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                <div className="mt-1.5 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={t('startOver')}
            >
              {t('newImport')}
            </button>
          </div>
        )}
      </div>

      {/* Track list or empty state */}
      <div className={cn('flex-1 min-h-0 px-6 pb-6', !hasResults && 'flex overflow-y-auto')}>
        {!hasResults ? (
          <ViewEmptyState
            title={t('emptyTitle')}
            subtitle={t('emptySubtitle')}
            icon={ListMusic}
            hints={[
              { icon: Link, label: 'YouTube' },
              { icon: Link, label: 'Spotify' },
            ]}
          />
        ) : (
          <List
            rowCount={tracks.length}
            rowHeight={52}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={PlaylistRow}
            rowProps={{
              tracks,
              isImporting,
              previewLoadingId,
              isPreviewPlaying,
              handlePreview,
              handleRemoveTrack,
              handleDownloadTrack,
            }}
          />
        )}
      </div>

      {/* Bulk action bar for multi-select */}
      {hasResults && hasSelection && (
        <ImportBulkActionBar
          tracks={tracks}
          isImporting={isImporting}
          onDownloadSelected={handleStartImportSelected}
          onRemoveSelected={handleRemoveTracks}
        />
      )}
    </div>
  );
}

export default PlaylistImportView;
