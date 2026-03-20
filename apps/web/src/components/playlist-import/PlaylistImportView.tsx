import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Link,
  Loader2,
  Check,
  AlertCircle,
  Music,
  X,
  Download,
  ListMusic,
  Play,
  Pause,
} from 'lucide-react';
import { List, type RowComponentProps } from 'react-window';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import {
  usePlaylistImportStore,
  type PlaylistTrack,
  type PlaylistTrackStatus,
} from '@/stores/usePlaylistImportStore';
import { toast } from 'sonner';
import type { DownloadProgress } from '@/types/electron';

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlaylistRowProps {
  tracks: PlaylistTrack[];
  isImporting: boolean;
  previewLoadingId: string | null;
  isPreviewPlaying: (result: { id: string }) => boolean;
  handlePreview: (result: PlaylistTrack['searchResult']) => void;
  handleRemoveTrack: (id: string) => void;
}

function PlaylistRow(props: RowComponentProps<PlaylistRowProps>) {
  const {
    index,
    style,
    tracks,
    isImporting,
    previewLoadingId,
    isPreviewPlaying,
    handlePreview,
    handleRemoveTrack,
  } = props as RowComponentProps<PlaylistRowProps> & PlaylistRowProps;

  const playlistTrack = tracks[index];
  if (!playlistTrack) return null;

  const result = playlistTrack.searchResult;
  const isActive =
    playlistTrack.status === 'downloading' || playlistTrack.status === 'converting';

  return (
    <div style={style} className="px-0.5">
      <div className="group flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors relative overflow-hidden h-full">
        {isActive && (
          <div
            className="absolute inset-0 bg-primary/5 transition-all duration-300"
            style={{ width: `${playlistTrack.progress}%` }}
          />
        )}

        <span className="w-6 text-center text-xs text-muted-foreground/40 tabular-nums relative z-10">
          {index + 1}
        </span>

        <button
          onClick={() => handlePreview(result)}
          className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0 relative z-10 group/thumb"
          title={isPreviewPlaying(result) ? 'Pause preview' : 'Preview'}
        >
          {result.thumbnail ? (
            <img src={result.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
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
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{result.uploader}</p>
            {playlistTrack.status !== 'pending' && (
              <span
                className={cn(
                  'text-[10px] font-medium shrink-0',
                  playlistTrack.status === 'done' && 'text-green-400',
                  playlistTrack.status === 'error' && 'text-destructive',
                  playlistTrack.status === 'skipped' && 'text-muted-foreground/50',
                  (playlistTrack.status === 'downloading' || playlistTrack.status === 'converting') &&
                    'text-primary'
                )}
              >
                {statusLabel(playlistTrack.status)}
                {playlistTrack.status === 'error' && playlistTrack.error ? `: ${playlistTrack.error}` : ''}
              </span>
            )}
          </div>
        </div>

        <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
          {formatDuration(result.duration)}
        </span>

        <div className="shrink-0 relative z-10 w-9 h-9 flex items-center justify-center">
          <StatusIcon track={playlistTrack} />
        </div>

        {playlistTrack.status === 'pending' && !isImporting && (
          <button
            onClick={() => handleRemoveTrack(result.id)}
            className="shrink-0 relative z-10 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Remove from list"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ track }: { track: PlaylistTrack }) {
  switch (track.status) {
    case 'done':
      return <Check className="w-4 h-4 text-green-400" />;
    case 'downloading':
    case 'converting':
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    case 'skipped':
      return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
    default:
      return <Download className="w-4 h-4 text-muted-foreground/30" />;
  }
}

function statusLabel(status: PlaylistTrackStatus): string {
  switch (status) {
    case 'downloading':
      return 'Downloading';
    case 'converting':
      return 'Converting';
    case 'done':
      return 'Done';
    case 'error':
      return 'Failed';
    case 'skipped':
      return 'Already in library';
    default:
      return 'Waiting';
  }
}

export function PlaylistImportView() {
  const [extractError, setExtractError] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const url = usePlaylistImportStore((s) => s.url);
  const setUrl = usePlaylistImportStore((s) => s.setUrl);
  const tracks = usePlaylistImportStore((s) => s.tracks);
  const isExtracting = usePlaylistImportStore((s) => s.isExtracting);
  const extractProgress = usePlaylistImportStore((s) => s.extractProgress);
  const isImporting = usePlaylistImportStore((s) => s.isImporting);
  const setTracks = usePlaylistImportStore((s) => s.setTracks);
  const removeTrack = usePlaylistImportStore((s) => s.removeTrack);
  const updateTrackStatus = usePlaylistImportStore((s) => s.updateTrackStatus);
  const startExtracting = usePlaylistImportStore((s) => s.startExtracting);
  const stopExtracting = usePlaylistImportStore((s) => s.stopExtracting);
  const setExtractProgress = usePlaylistImportStore((s) => s.setExtractProgress);
  const startImporting = usePlaylistImportStore((s) => s.startImporting);
  const cancelImport = usePlaylistImportStore((s) => s.cancelImport);
  const reset = usePlaylistImportStore((s) => s.reset);

  const addToLibrary = usePlayerStore((s) => s.addToLibrary);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setQueue = usePlayerStore((s) => s.setQueue);

  // Listen to download progress events
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onProgress((data: DownloadProgress) => {
      const statusMap: Record<string, PlaylistTrackStatus> = {
        downloading: 'downloading',
        converting: 'converting',
        done: 'done',
        error: 'error',
      };
      const mapped = statusMap[data.status] ?? 'downloading';
      // Only update if not done/error (final state set by import loop)
      if (mapped === 'downloading' || mapped === 'converting') {
        updateTrackStatus(data.url, mapped, data.progress);
      }
    });
    return cleanup;
  }, [updateTrackStatus]);

  // Listen to Spotify extraction progress
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.playlist.onExtractProgress((data) => {
      setExtractProgress(data);
    });
    return cleanup;
  }, [setExtractProgress]);

  const handleExtract = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed || !IS_ELECTRON) return;

    setExtractError(null);
    startExtracting();

    try {
      const results = await window.electronAPI.playlist.extract(trimmed);
      if (results.length === 0) {
        setExtractError('No tracks found in this playlist. It may be empty or private.');
        stopExtracting();
        return;
      }
      setTracks(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract playlist';
      setExtractError(msg);
      stopExtracting();
    }
  }, [url, startExtracting, stopExtracting, setTracks]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleExtract();
      }
    },
    [handleExtract]
  );

  const isPreviewPlaying = useCallback(
    (result: { id: string }) => {
      return currentTrack?.id === `preview-${result.id}` && isPlaying;
    },
    [currentTrack, isPlaying]
  );

  const handlePreview = useCallback(
    async (result: PlaylistTrack['searchResult']) => {
      if (!IS_ELECTRON) return;

      const previewTrackId = `preview-${result.id}`;

      if (currentTrack?.id === previewTrackId) {
        usePlayerStore.getState().togglePlay();
        return;
      }

      setPreviewLoadingId(result.id);

      try {
        const streamUrl = await window.electronAPI.downloader.getStreamUrl(
          result.webpage_url || result.url
        );

        const previewTrack: Track = {
          id: previewTrackId,
          title: result.title,
          artist: result.uploader,
          album: 'Playlist Import',
          duration: result.duration,
          filePath: `shiranami-radio://stream?url=${encodeURIComponent(streamUrl)}`,
          albumArt: result.thumbnail || undefined,
        };

        setQueue([previewTrack], 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load preview';
        toast.error(`Preview failed: ${msg}`);
      } finally {
        setPreviewLoadingId(null);
      }
    },
    [currentTrack, setQueue]
  );

  const handleRemoveTrack = useCallback(
    (id: string) => {
      removeTrack(id);
    },
    [removeTrack]
  );

  const importTrack = useCallback(
    async (filePath: string): Promise<void> => {
      const { metadata } = await window.electronAPI.library.parseMetadata(filePath);

      const exists = await window.electronAPI.db.tracks.exists(filePath);
      if (exists) {
        return;
      }

      const dbTrack = (await window.electronAPI.db.tracks.add({
        filePath,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        duration: metadata.duration,
        genre: metadata.genre ?? null,
        year: metadata.year ?? null,
        trackNumber: metadata.trackNumber ?? null,
        albumArt: metadata.albumArt ?? null,
      })) as Record<string, unknown>;

      const track: Track = {
        id: dbTrack.id as string,
        title: dbTrack.title as string,
        artist: (dbTrack.artist as string) ?? 'Unknown Artist',
        album: (dbTrack.album as string) ?? 'Unknown Album',
        duration: (dbTrack.duration as number) ?? 0,
        filePath: dbTrack.filePath as string,
        albumArt: (dbTrack.albumArt as string | null) ?? undefined,
        genre: dbTrack.genre as string | null | undefined,
        year: dbTrack.year as number | null | undefined,
        trackNumber: dbTrack.trackNumber as number | null | undefined,
        isFavorite: (dbTrack.isFavorite as boolean) ?? false,
        playCount: (dbTrack.playCount as number) ?? 0,
        createdAt: dbTrack.createdAt as string | undefined,
        updatedAt: dbTrack.updatedAt as string | undefined,
      };

      addToLibrary([track]);

      const currentQueue = usePlayerStore.getState().queue;
      const currentPlaying = usePlayerStore.getState().currentTrack;
      const newQueue = [...currentQueue, track];
      if (!currentPlaying) {
        setQueue(newQueue, newQueue.length - 1);
      } else {
        usePlayerStore.setState({ queue: newQueue });
      }
    },
    [addToLibrary, setQueue]
  );

  const handleStartImport = useCallback(async () => {
    if (!IS_ELECTRON) return;
    startImporting();

    const currentTracks = usePlaylistImportStore.getState().tracks;

    for (const playlistTrack of currentTracks) {
      // Check cancellation between each download
      if (usePlaylistImportStore.getState().isCancelled) break;

      // Skip non-pending tracks (already done, errored, or skipped)
      if (playlistTrack.status !== 'pending') continue;

      const trackUrl = playlistTrack.searchResult.webpage_url || playlistTrack.searchResult.url;

      updateTrackStatus(trackUrl, 'downloading', 0);

      try {
        const filePath = await window.electronAPI.downloader.download(trackUrl);

        // Check if already in library
        const exists = await window.electronAPI.db.tracks.exists(filePath);
        if (exists) {
          updateTrackStatus(trackUrl, 'skipped');
          continue;
        }

        await importTrack(filePath);
        updateTrackStatus(trackUrl, 'done', 100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Download failed';
        updateTrackStatus(trackUrl, 'error', 0, msg);
      }
    }

    usePlaylistImportStore.setState({ isImporting: false });

    if (!usePlaylistImportStore.getState().isCancelled) {
      const finalTracks = usePlaylistImportStore.getState().tracks;
      const doneCount = finalTracks.filter((t) => t.status === 'done').length;
      const skippedCount = finalTracks.filter((t) => t.status === 'skipped').length;
      const errorCount = finalTracks.filter((t) => t.status === 'error').length;

      let message = `Imported ${doneCount} track${doneCount !== 1 ? 's' : ''}`;
      if (skippedCount > 0) message += `, ${skippedCount} already in library`;
      if (errorCount > 0) message += `, ${errorCount} failed`;

      toast.success(message);
    } else {
      toast.info('Playlist import cancelled');
    }
  }, [startImporting, updateTrackStatus, importTrack]);

  const handleCancel = useCallback(() => {
    cancelImport();
    if (IS_ELECTRON) {
      window.electronAPI.playlist.cancel();
    }
  }, [cancelImport]);

  const handleReset = useCallback(() => {
    reset();
    setExtractError(null);
  }, [reset]);

  const completedCount = tracks.filter(
    (t) => t.status === 'done' || t.status === 'skipped'
  ).length;
  const totalCount = tracks.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pendingCount = tracks.filter((t) => t.status === 'pending').length;
  const hasResults = tracks.length > 0;
  const isFinished = hasResults && !isImporting && pendingCount === 0;

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

        {/* Extraction progress for YouTube (no per-track progress, just a spinner) */}
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
                    {completedCount}/{totalCount} complete
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
