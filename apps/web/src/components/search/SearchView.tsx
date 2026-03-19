import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Download,
  Check,
  AlertCircle,
  Loader2,
  Music,
  ArrowDownToLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';
import type { SearchResult, DownloadProgress } from '@/types/electron';

interface DownloadState {
  progress: number;
  status: 'idle' | 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
  filePath?: string;
}

type InstallStatus = 'idle' | 'downloading' | 'done' | 'error';
type DependencyState = 'checking' | 'needs-install' | 'ready';

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SearchStateCard({
  title,
  description,
  loading = false,
  children,
}: {
  title: string;
  description: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-border/30 bg-surface/40 px-8 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="mx-auto relative w-24 h-24 rounded-[28px] bg-primary/8 border border-primary/10 flex items-center justify-center">
          <img
            src="./mascot.png"
            alt=""
            className="w-16 h-16 object-contain opacity-80"
            draggable={false}
          />
          {loading && (
            <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="font-display text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dependencyState, setDependencyState] = useState<DependencyState>('checking');
  const [dependencyInstallStatus, setDependencyInstallStatus] = useState<InstallStatus>('idle');
  const [dependencyInstallError, setDependencyInstallError] = useState<string | null>(null);
  const [dependenciesSnapshot, setDependenciesSnapshot] = useState<{
    ytdlpInstalled: boolean;
    ffmpegInstalled: boolean;
  } | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const addToLibrary = usePlayerStore((s) => s.addToLibrary);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const isDependencyInstallInProgress = useDownloadStore((s) => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore((s) => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore((s) => s.dependencyInstallLabel);
  const dependencyInstallTarget = useDownloadStore((s) => s.dependencyInstallTarget);
  const startDependencyInstall = useDownloadStore((s) => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore((s) => s.stopDependencyInstall);

  const refreshDependencies = useCallback(async () => {
    if (!IS_ELECTRON) {
      return {
        ytdlpInstalled: false,
        ffmpegInstalled: false,
      };
    }

    try {
      const snapshot = await window.electronAPI.downloader.checkDependencies();
      setDependenciesSnapshot(snapshot);
      setDependencyState(snapshot.ytdlpInstalled ? 'ready' : 'needs-install');
      return snapshot;
    } catch {
      const snapshot = { ytdlpInstalled: false, ffmpegInstalled: false };
      setDependenciesSnapshot(snapshot);
      setDependencyState('needs-install');
      return snapshot;
    }
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    refreshDependencies();
  }, [refreshDependencies]);

  useEffect(() => {
    if (!isDependencyInstallInProgress) return;
    setDependencyInstallStatus('downloading');
  }, [isDependencyInstallInProgress]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    if (dependencyInstallTarget !== 'ffmpeg') return;

    let cancelled = false;

    refreshDependencies().then((snapshot) => {
      if (cancelled || !snapshot.ytdlpInstalled) return;
      setDependencyState('ready');
    });

    return () => {
      cancelled = true;
    };
  }, [dependencyInstallTarget, refreshDependencies]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    if (isDependencyInstallInProgress) return;
    if (dependencyInstallStatus !== 'downloading') return;

    let cancelled = false;

    refreshDependencies().then((snapshot) => {
      if (cancelled) return;

      if (snapshot.ytdlpInstalled) {
        setDependencyInstallStatus('done');
        setDependencyInstallError(null);
        setDependencyState('ready');
        return;
      }

      setDependencyInstallStatus('error');
      setDependencyInstallError('Installation failed');
      setDependencyState('needs-install');
    });

    return () => {
      cancelled = true;
    };
  }, [dependencyInstallStatus, isDependencyInstallInProgress, refreshDependencies]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onProgress((data: DownloadProgress) => {
      setDownloads((prev) => ({
        ...prev,
        [data.url]: {
          ...prev[data.url],
          progress: data.progress,
          status: data.status,
          error: data.error,
        },
      }));
    });
    return cleanup;
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !IS_ELECTRON) return;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const searchResults = await window.electronAPI.downloader.search(trimmed);
      setResults(searchResults);
      if (searchResults.length === 0) {
        setSearchError('No results found. Try a different search term.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleInstallDependencies = useCallback(async () => {
    if (!IS_ELECTRON) return;

    setDependencyInstallStatus('downloading');
    setDependencyInstallError(null);
    startDependencyInstall();

    try {
      const result = await window.electronAPI.downloader.installDependencies();
      const snapshot = await refreshDependencies();

      if (snapshot.ytdlpInstalled) {
        setDependencyInstallStatus('done');

        if (result.success) {
          toast.success('Download tools installed successfully', {
            id: 'dependency-install',
          });
        } else {
          toast.error(result.error ?? 'ffmpeg could not be installed completely', {
            id: 'dependency-install',
          });
        }

        window.setTimeout(() => {
          setDependencyState('ready');
        }, 700);
        return;
      }

      setDependencyInstallStatus('error');
      setDependencyInstallError(result.error ?? 'Installation failed');
      toast.error(result.error ?? 'Failed to install search tools', {
        id: 'dependency-install',
      });
    } catch (err) {
      await refreshDependencies();
      const msg = err instanceof Error ? err.message : 'Installation failed';
      setDependencyInstallStatus('error');
      setDependencyInstallError(msg);
      toast.error(`Failed to install search tools: ${msg}`, {
        id: 'dependency-install',
      });
    } finally {
      stopDependencyInstall();
    }
  }, [refreshDependencies, startDependencyInstall, stopDependencyInstall]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const importTrack = useCallback(
    async (filePath: string) => {
      try {
        const { metadata } = await window.electronAPI.library.parseMetadata(filePath);

        const exists = await window.electronAPI.db.tracks.exists(filePath);
        if (exists) {
          toast.info('Track already in library');
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

        toast.success(`Downloaded: ${track.title}`);
      } catch (err) {
        console.error('Failed to import downloaded track:', err);
        toast.error('Failed to import track to library');
      }
    },
    [addToLibrary, setQueue]
  );

  const handleDownload = useCallback(
    async (result: SearchResult) => {
      if (!IS_ELECTRON) return;
      const url = result.webpage_url || result.url;

      setDownloads((prev) => ({
        ...prev,
        [url]: { progress: 0, status: 'downloading' },
      }));

      try {
        const filePath = await window.electronAPI.downloader.download(url);
        setDownloads((prev) => ({
          ...prev,
          [url]: { progress: 100, status: 'done', filePath },
        }));
        await importTrack(filePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Download failed';
        setDownloads((prev) => ({
          ...prev,
          [url]: { progress: 0, status: 'error', error: msg },
        }));
        toast.error(`Download failed: ${msg}`);
      }
    },
    [importTrack]
  );

  const getDownloadState = (result: SearchResult): DownloadState => {
    const url = result.webpage_url || result.url;
    return downloads[url] ?? { progress: 0, status: 'idle' };
  };

  const showCenteredSearchState = results.length === 0;

  if (dependencyState === 'checking') {
    return (
      <SearchStateCard
        title="Preparing search"
        description="Checking yt-dlp and ffmpeg so this view can open cleanly."
        loading
      />
    );
  }

  if (dependencyState === 'needs-install') {
    const installAllText =
      dependenciesSnapshot?.ffmpegInstalled === false
        ? 'Install yt-dlp and ffmpeg together so search and proper audio downloads are ready in one step.'
        : 'Install yt-dlp so Shiranami can search and download music from YouTube.';

    return (
      <SearchStateCard title="Search tools missing" description={installAllText}>
        <div className="space-y-3">
          {dependencyInstallStatus === 'downloading' || isDependencyInstallInProgress ? (
            <div className="space-y-3">
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${dependencyInstallProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {dependencyInstallLabel}... {dependencyInstallProgress}%
              </p>
            </div>
          ) : dependencyInstallStatus === 'done' ? (
            <div className="flex items-center justify-center gap-2 text-green-400">
              <Check className="w-4 h-4" />
              <p className="text-sm font-medium">Search tools installed</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleInstallDependencies}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <ArrowDownToLine className="w-4 h-4" />
                Install Missing Tools
              </button>
              {dependencyInstallStatus === 'error' && dependencyInstallError && (
                <p className="text-xs text-destructive">{dependencyInstallError}</p>
              )}
            </>
          )}
        </div>
      </SearchStateCard>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for music..."
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-card border border-border/50',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40',
              'transition-colors'
            )}
          />
          {isSearching && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {isDependencyInstallInProgress && (
          <div className="mt-3 max-w-2xl rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {dependencyInstallTarget === 'ffmpeg'
                    ? 'Installing ffmpeg in the background'
                    : 'Installing search tools'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dependencyInstallLabel}... {dependencyInstallProgress}%
                </p>
              </div>
            </div>
            <div className="mt-3 w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${dependencyInstallProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex-1 overflow-y-auto scrollbar-thin px-6 pb-6',
          showCenteredSearchState && 'flex'
        )}
      >
        {showCenteredSearchState ? (
          <div className="flex-1 min-h-full flex items-center justify-center">
            {isSearching ? (
              <div className="w-full max-w-md flex flex-col items-center justify-center gap-5 rounded-[28px] border border-border/20 bg-surface/20 px-8 py-10 text-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
                  <img
                    src="./mascot.png"
                    alt=""
                    className="relative w-24 h-24 object-contain opacity-60"
                    draggable={false}
                  />
                </div>
                <div>
                  <p className="font-display text-sm font-medium text-foreground/85">
                    Searching YouTube
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Pulling the best matches for "{query.trim()}"
                  </p>
                </div>
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
            ) : searchError ? (
              <div className="w-full max-w-md rounded-[28px] border border-border/20 bg-surface/20 px-8 py-10 text-center">
                <p className="text-sm text-muted-foreground">{searchError}</p>
              </div>
            ) : (
              <div className="w-full max-w-md flex flex-col items-center justify-center gap-4 rounded-[28px] border border-border/20 bg-surface/20 px-8 py-10 text-center">
                <img
                  src="./mascot.png"
                  alt=""
                  className="w-24 h-24 object-contain opacity-30"
                  draggable={false}
                />
                <div>
                  <p className="font-display text-sm font-medium text-muted-foreground">
                    Search YouTube for music
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    Type a song name and press Enter
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {results.map((result) => {
              const dlState = getDownloadState(result);
              const isDownloading =
                dlState.status === 'downloading' || dlState.status === 'converting';
              const isDone = dlState.status === 'done';
              const isError = dlState.status === 'error';

              return (
                <div
                  key={result.id}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition-colors relative overflow-hidden"
                >
                  {isDownloading && (
                    <div
                      className="absolute inset-0 bg-primary/5 transition-all duration-300"
                      style={{ width: `${dlState.progress}%` }}
                    />
                  )}

                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted shrink-0 relative z-10">
                    {result.thumbnail ? (
                      <img
                        src={result.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 relative z-10">
                    <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {result.uploader}
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
                        onClick={() => handleDownload(result)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                        title={dlState.error ?? 'Retry download'}
                      >
                        <AlertCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDownload(result)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
