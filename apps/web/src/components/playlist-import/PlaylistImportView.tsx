import { useRef, useCallback } from 'react';
import { Link, Loader2, AlertCircle, X, Download, ListMusic } from 'lucide-react';
import { ViewEmptyState } from '../shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { List } from 'react-window';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { usePlaylistImport } from '@/hooks/usePlaylistImport';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { PlaylistRow } from './PlaylistRow';
import { ImportBulkActionBar } from './ImportBulkActionBar';
import { ProgressBar } from '@/components/ui/progress-bar';

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
      <PageHeader title={t('pageTitle')} />
      {/* URL input + controls */}
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
              <Button
                size="sm"
                onClick={handleExtract}
                disabled={!url.trim()}
                className="rounded-lg"
              >
                {t('extract')}
              </Button>
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
            <ProgressBar
              value={Math.round((extractProgress.current / extractProgress.total) * 100)}
              className="mt-2 h-1.5"
            />
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
              <Button onClick={handleDownloadClick} className="rounded-xl">
                <Download />
                {hasSelection
                  ? t('downloadSelected', { count: selectedPendingCount })
                  : t('downloadAll', { count: pendingCount })}
              </Button>
            )}
            {isImporting && (
              <Button
                onClick={handleCancel}
                className="rounded-xl bg-destructive/10 text-destructive shadow-none hover:bg-destructive/20 hover:text-destructive"
              >
                <X />
                {t('cancel')}
              </Button>
            )}
            {(isImporting || isFinished) && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t('processed', { done: processedCount, total: totalCount })}</span>
                  {isImporting && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                <ProgressBar value={overallProgress} className="mt-1.5 h-1.5" />
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="rounded-xl text-muted-foreground"
              title={t('startOver')}
            >
              {t('newImport')}
            </Button>
          </div>
        )}
      </div>

      {/* Track list or empty state */}
      {!hasResults ? (
        <div className="flex-1 min-h-0 flex overflow-y-auto">
          <ViewEmptyState
            title={t('emptyTitle')}
            subtitle={t('emptySubtitle')}
            icon={ListMusic}
            hints={[
              { icon: Link, label: 'YouTube' },
              { icon: Link, label: 'Spotify' },
            ]}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2 py-1.5">
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
          </div>
        </div>
      )}

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
