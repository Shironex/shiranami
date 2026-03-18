import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Download, Check, AlertCircle, Loader2, Music, ArrowDownToLine, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import type { SearchResult, DownloadProgress } from '@/types/electron';

interface DownloadState {
  progress: number;
  status: 'idle' | 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
  filePath?: string;
}

type InstallStatus = 'idle' | 'downloading' | 'done' | 'error';

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ytdlpInstalled, setYtdlpInstalled] = useState<boolean | null>(null);
  const [ytdlpVersion, setYtdlpVersion] = useState<string | undefined>();
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [installStatus, setInstallStatus] = useState<InstallStatus>('idle');
  const [installProgress, setInstallProgress] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);
  const [ffmpegInstalled, setFfmpegInstalled] = useState<boolean | null>(null);
  const [ffmpegInstalling, setFfmpegInstalling] = useState(false);
  const [ffmpegInstallProgress, setFfmpegInstallProgress] = useState(0);
  const [ffmpegBannerDismissed, setFfmpegBannerDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setQueue = usePlayerStore(s => s.setQueue);

  // Check yt-dlp availability on mount
  useEffect(() => {
    if (!IS_ELECTRON) return;
    window.electronAPI.downloader.check().then(({ installed, version }) => {
      setYtdlpInstalled(installed);
      setYtdlpVersion(version);
    });
    window.electronAPI.downloader.checkFfmpeg().then(({ installed }) => {
      setFfmpegInstalled(installed);
    });
  }, []);

  // Listen for yt-dlp install progress
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onInstallProgress(
      (progress: { percent: number }) => {
        setInstallProgress(progress.percent);
      }
    );
    return cleanup;
  }, []);

  // Listen for ffmpeg install progress
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onFfmpegInstallProgress(
      (progress: { percent: number }) => {
        setFfmpegInstallProgress(progress.percent);
      }
    );
    return cleanup;
  }, []);

  // Listen for download progress updates
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onProgress((data: DownloadProgress) => {
      setDownloads(prev => ({
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

  const handleInstallYtDlp = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setInstallStatus('downloading');
    setInstallProgress(0);
    setInstallError(null);

    try {
      const result = await window.electronAPI.downloader.installYtDlp();
      if (result.success) {
        setInstallStatus('done');
        toast.success('yt-dlp installed successfully');
        // Transition to search view after brief success message
        setTimeout(() => {
          setYtdlpInstalled(true);
          // Fetch version in background (may be slow on first run)
          window.electronAPI.downloader.check().then(({ version }) => {
            if (version) setYtdlpVersion(version);
          });
        }, 1200);
      } else {
        setInstallStatus('error');
        setInstallError(result.error ?? 'Installation failed');
        toast.error(`Failed to install yt-dlp: ${result.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      setInstallStatus('error');
      const msg = err instanceof Error ? err.message : 'Installation failed';
      setInstallError(msg);
      toast.error(`Failed to install yt-dlp: ${msg}`);
    }
  }, []);

  const handleInstallFfmpeg = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setFfmpegInstalling(true);
    setFfmpegInstallProgress(0);

    try {
      const result = await window.electronAPI.downloader.installFfmpeg();
      if (result.success) {
        toast.success('ffmpeg installed successfully');
        setFfmpegInstalled(true);
        setFfmpegBannerDismissed(true);
      } else {
        toast.error(`Failed to install ffmpeg: ${result.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install ffmpeg: ${msg}`);
    } finally {
      setFfmpegInstalling(false);
    }
  }, []);

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
    [setQueue]
  );

  const handleDownload = useCallback(
    async (result: SearchResult) => {
      if (!IS_ELECTRON) return;
      const url = result.webpage_url || result.url;

      setDownloads(prev => ({
        ...prev,
        [url]: { progress: 0, status: 'downloading' },
      }));

      try {
        const filePath = await window.electronAPI.downloader.download(url);
        setDownloads(prev => ({
          ...prev,
          [url]: { progress: 100, status: 'done', filePath },
        }));
        await importTrack(filePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Download failed';
        setDownloads(prev => ({
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

  // yt-dlp not installed -- offer one-click download
  if (ytdlpInstalled === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ArrowDownToLine className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="font-display text-base font-medium text-foreground">
            yt-dlp required
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            yt-dlp is needed to search and download music. Click below to download it automatically.
          </p>
        </div>

        <div className="mt-2 max-w-sm w-full space-y-3">
          {installStatus === 'downloading' ? (
            <div className="space-y-2">
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${installProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Downloading yt-dlp... {installProgress}%
              </p>
            </div>
          ) : installStatus === 'done' ? (
            <div className="flex items-center justify-center gap-2 text-green-400">
              <Check className="w-4 h-4" />
              <p className="text-sm font-medium">yt-dlp installed successfully</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleInstallYtDlp}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download yt-dlp
              </button>
              {installStatus === 'error' && installError && (
                <p className="text-xs text-destructive">{installError}</p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Still checking yt-dlp
  if (ytdlpInstalled === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search bar */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
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
        {ytdlpVersion && (
          <p className="text-[10px] text-muted-foreground/40 mt-2">
            yt-dlp {ytdlpVersion}
          </p>
        )}
      </div>

      {/* ffmpeg info banner */}
      {ffmpegInstalled === false && !ffmpegBannerDismissed && (
        <div className="px-6 pb-2 shrink-0">
          <div className="max-w-2xl flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-primary/5 border border-primary/10">
            <Info className="w-4 h-4 text-primary shrink-0" />
            {ffmpegInstalling ? (
              <div className="flex-1 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Downloading ffmpeg... {ffmpegInstallProgress}%
                </p>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${ffmpegInstallProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground flex-1">
                  Install ffmpeg for MP3 conversion and thumbnail embedding
                </p>
                <button
                  onClick={handleInstallFfmpeg}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
                >
                  Download
                </button>
              </>
            )}
            <button
              onClick={() => setFfmpegBannerDismissed(true)}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
        {isSearching && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <img src="./mascot.png" alt="" className="w-20 h-20 object-contain opacity-40 animate-pulse" draggable={false} />
            <div>
              <p className="font-display text-sm font-medium text-muted-foreground">
                Searching for music...
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                This may take a moment
              </p>
            </div>
          </div>
        )}

        {searchError && !isSearching && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{searchError}</p>
          </div>
        )}

        {results.length === 0 && !isSearching && !searchError && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <img src="./mascot.png" alt="" className="w-24 h-24 object-contain opacity-30" draggable={false} />
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

        {results.length > 0 && (
          <div className="space-y-1">
            {results.map(result => {
              const dlState = getDownloadState(result);
              const isDownloading = dlState.status === 'downloading' || dlState.status === 'converting';
              const isDone = dlState.status === 'done';
              const isError = dlState.status === 'error';

              return (
                <div
                  key={result.id}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition-colors relative overflow-hidden"
                >
                  {/* Progress bar background */}
                  {isDownloading && (
                    <div
                      className="absolute inset-0 bg-primary/5 transition-all duration-300"
                      style={{ width: `${dlState.progress}%` }}
                    />
                  )}

                  {/* Thumbnail */}
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

                  {/* Info */}
                  <div className="flex-1 min-w-0 relative z-10">
                    <p className="text-sm font-medium text-foreground truncate">
                      {result.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {result.uploader}
                    </p>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
                    {formatDuration(result.duration)}
                  </span>

                  {/* Download button / status */}
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
