import { useRef } from 'react';
import {
  Link,
  Loader2,
  AlertCircle,
  X,
  Download,
  ListMusic,
} from 'lucide-react';
import { List } from 'react-window';
import { cn } from '@/lib/utils';
import { usePlaylistImport } from '@/hooks/usePlaylistImport';
import { PlaylistRow } from './PlaylistRow';

export function PlaylistImportView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    url, setUrl, tracks, isExtracting, extractProgress, isImporting,
    extractError, previewLoadingId, processedCount, totalCount, pendingCount,
    overallProgress, hasResults, isFinished,
    handleExtract, handleKeyDown, handleStartImport, handleCancel,
    handleReset, handleRemoveTrack, isPreviewPlaying, handlePreview,
  } = usePlaylistImport();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Link className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste a YouTube or Spotify playlist URL..."
            disabled={isExtracting || isImporting}
            className={cn(
              'w-full pl-10 pr-24 py-2.5 rounded-xl text-sm bg-card border border-border/50',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40',
              'transition-colors disabled:opacity-50'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isExtracting && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {!isExtracting && !isImporting && !hasResults && (
              <button
                onClick={handleExtract}
                disabled={!url.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extract
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
                Resolving track {extractProgress.current}/{extractProgress.total}: {extractProgress.trackName}
              </span>
            </div>
            <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.round((extractProgress.current / extractProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Extraction progress for YouTube */}
        {isExtracting && !extractProgress && (
          <div className="mt-3 max-w-2xl flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>Fetching playlist tracks...</span>
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
                onClick={handleStartImport}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download All ({pendingCount} tracks)
              </button>
            )}
            {isImporting && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            )}
            {(isImporting || isFinished) && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {processedCount}/{totalCount} processed
                  </span>
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
              title="Start over"
            >
              New Import
            </button>
          </div>
        )}
      </div>

      {/* Track list or empty state */}
      <div
        className={cn(
          'flex-1 min-h-0 px-6 pb-6',
          !hasResults && 'flex overflow-y-auto'
        )}
      >
        {!hasResults ? (
          <div className="flex-1 min-h-full flex items-center justify-center">
            <div className="w-full max-w-md flex flex-col items-center justify-center gap-4 rounded-[28px] border border-border/20 bg-surface/20 px-8 py-10 text-center">
              <div className="w-24 h-24 rounded-[28px] bg-primary/8 border border-primary/10 flex items-center justify-center">
                <ListMusic className="w-10 h-10 text-primary/40" />
              </div>
              <div>
                <p className="font-display text-sm font-medium text-muted-foreground">
                  Import a playlist
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1 max-w-[280px]">
                  Paste a YouTube or Spotify playlist URL above to fetch all tracks and download them to your library
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
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
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PlaylistImportView;
