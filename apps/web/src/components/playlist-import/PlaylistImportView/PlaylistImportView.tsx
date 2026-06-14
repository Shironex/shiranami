import { Link, Loader2, AlertCircle, X, Download, ListMusic } from 'lucide-react';
import { List } from 'react-window';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { PlaylistRow } from '../PlaylistRow';
import { ImportBulkActionBar } from '../ImportBulkActionBar';
import { usePlaylistImportView } from './PlaylistImportView.hooks';

export default function PlaylistImportView() {
  const view = usePlaylistImportView();

  const emptyHints = [
    { icon: Link, label: 'YouTube' },
    { icon: Link, label: 'Spotify' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={view.t('pageTitle')} />
      {/* URL input + controls */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Link className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/55 pointer-events-none" />
          <Input
            ref={view.inputRef}
            type="text"
            value={view.url}
            onChange={e => view.setUrl(e.target.value)}
            onKeyDown={view.handleKeyDown}
            placeholder={view.t('urlPlaceholder')}
            disabled={view.inputDisabled}
            className={cn(
              'h-auto w-full pl-10 pr-24 py-2.5 rounded-xl text-sm glass-subtle border-border/40',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus-visible:ring-primary/40 focus-visible:border-primary/40',
              'shadow-none'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {view.isExtracting && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {view.showExtractButton && (
              <Button
                size="sm"
                onClick={view.handleExtract}
                disabled={view.extractDisabled}
                className="rounded-lg"
              >
                {view.t('extract')}
              </Button>
            )}
          </div>
        </div>

        {/* Extraction progress for Spotify */}
        {view.extractProgress && (
          <div className="mt-3 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">
                {view.t('resolvingTrack', {
                  current: view.extractProgress.current,
                  total: view.extractProgress.total,
                  name: view.extractProgress.trackName,
                })}
              </span>
            </div>
            <ProgressBar value={view.extractProgressPercent} className="mt-2 h-1.5" />
          </div>
        )}

        {/* Extraction progress for YouTube */}
        {view.showFetchingProgress && (
          <div className="mt-3 max-w-2xl flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>{view.t('fetching')}</span>
          </div>
        )}

        {/* Error state */}
        {view.extractError && (
          <div className="mt-3 max-w-2xl flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{view.extractError}</span>
          </div>
        )}

        {/* Action bar when tracks are loaded */}
        {view.hasResults && (
          <div className="mt-3 max-w-2xl flex items-center gap-3">
            {view.showDownloadButton && (
              <Button onClick={view.onDownloadClick} className="rounded-xl">
                <Download />
                {view.hasSelection
                  ? view.t('downloadSelected', { count: view.selectedPendingCount })
                  : view.t('downloadAll', { count: view.pendingCount })}
              </Button>
            )}
            {view.showCancelButton && (
              <Button
                onClick={view.handleCancel}
                className="rounded-xl bg-destructive/10 text-destructive shadow-none hover:bg-destructive/20 hover:text-destructive"
              >
                <X />
                {view.t('cancel')}
              </Button>
            )}
            {view.showProgressBlock && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {view.t('processed', { done: view.processedCount, total: view.totalCount })}
                  </span>
                  {view.isImporting && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                <ProgressBar value={view.overallProgress} className="mt-1.5 h-1.5" />
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={view.handleReset}
              className="rounded-xl text-muted-foreground"
              title={view.t('startOver')}
            >
              {view.t('newImport')}
            </Button>
          </div>
        )}

        {/* Preserve the source playlist: recreate a real Shiranami playlist
            (name + order) from the imported tracks. Only offered when the
            provider exposed a playlist name and the import hasn't started. */}
        {view.showCreatePlaylistOption && (
          <label className="mt-3 max-w-2xl flex items-center gap-2.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={view.createPlaylist}
              onCheckedChange={value => view.setCreatePlaylist(value === true)}
            />
            <span>{view.t('createPlaylistOption', { name: view.sourceTitle })}</span>
          </label>
        )}
      </div>

      {/* Track list or empty state */}
      {!view.hasResults ? (
        <div className="flex-1 min-h-0 flex">
          <ViewEmptyState
            title={view.t('emptyTitle')}
            subtitle={view.t('emptySubtitle')}
            icon={ListMusic}
            hints={emptyHints}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2 py-1.5">
            <List
              rowCount={view.tracks.length}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={PlaylistRow}
              rowProps={view.rowProps}
            />
          </div>
        </div>
      )}

      {/* Bulk action bar for multi-select */}
      {view.showBulkActionBar && (
        <ImportBulkActionBar
          tracks={view.tracks}
          isImporting={view.isImporting}
          onDownloadSelected={view.handleStartImportSelected}
          onRemoveSelected={view.handleRemoveTracks}
        />
      )}
    </div>
  );
}
