import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import {
  FolderOpen,
  Trash2,
  RefreshCw,
  Info,
  HardDrive,
  Music,
  Settings2,
  X,
  Plus,
  Loader2,
  Download,
  Check,
  ArrowDownToLine,
} from 'lucide-react';

interface WatchedFolder {
  id: string;
  path: string;
  lastScannedAt?: string;
}

interface SettingsData {
  rememberPlaybackPosition: boolean;
  gaplessPlayback: boolean;
}

const DEFAULT_SETTINGS: SettingsData = {
  rememberPlaybackPosition: false,
  gaplessPlayback: false,
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        backgroundColor: checked
          ? 'var(--primary)'
          : 'oklch(0.2 0.02 280)',
      }}
    >
      <motion.span
        className="pointer-events-none block h-5 w-5 rounded-full bg-foreground shadow-sm"
        animate={{ x: checked ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{ marginTop: 2 }}
      />
    </button>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Settings2;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function SettingsView() {
  const library = usePlayerStore((s) => s.library);
  const addToLibrary = usePlayerStore((s) => s.addToLibrary);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [version, setVersion] = useState('0.1.0');
  const [isScanning, setIsScanning] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // yt-dlp state
  const [ytdlpInstalled, setYtdlpInstalled] = useState<boolean | null>(null);
  const [ytdlpVersion, setYtdlpVersion] = useState<string | undefined>();
  const [ytdlpLatestVersion, setYtdlpLatestVersion] = useState<string | undefined>();
  const [ytdlpUpdateAvailable, setYtdlpUpdateAvailable] = useState(false);
  const [ytdlpPath, setYtdlpPath] = useState<string>('');
  const [ytdlpInstalling, setYtdlpInstalling] = useState(false);
  const [ytdlpInstallProgress, setYtdlpInstallProgress] = useState(0);
  const [downloadLocation, setDownloadLocation] = useState('');
  const [downloadLocationDefaultPath, setDownloadLocationDefaultPath] = useState('');
  const [downloadLocationIsDefault, setDownloadLocationIsDefault] = useState(true);
  const [downloadLocationUpdating, setDownloadLocationUpdating] = useState(false);

  // ffmpeg state
  const [ffmpegInstalled, setFfmpegInstalled] = useState<boolean | null>(null);
  const [ffmpegVersion, setFfmpegVersion] = useState<string | undefined>();
  const [ffmpegLatestVersion, setFfmpegLatestVersion] = useState<string | undefined>();
  const [ffmpegUpdateAvailable, setFfmpegUpdateAvailable] = useState(false);
  const [ffmpegInstalling, setFfmpegInstalling] = useState(false);
  const [ffmpegInstallProgress, setFfmpegInstallProgress] = useState(0);
  const isDependencyInstallInProgress = useDownloadStore((s) => s.isDependencyInstallInProgress);
  const dependencyInstallProgress = useDownloadStore((s) => s.dependencyInstallProgress);
  const dependencyInstallLabel = useDownloadStore((s) => s.dependencyInstallLabel);
  const startDependencyInstall = useDownloadStore((s) => s.startDependencyInstall);
  const stopDependencyInstall = useDownloadStore((s) => s.stopDependencyInstall);

  // Load folders, settings, and version on mount
  useEffect(() => {
    if (!IS_ELECTRON) {
      setFoldersLoading(false);
      return;
    }

    async function load() {
      try {
        const [allFolders, savedSettings, appVersion] = await Promise.all([
          window.electronAPI.db.folders.getAll(),
          window.electronAPI.store.get<SettingsData>('settings'),
          window.electronAPI.app.getVersion(),
        ]);
        setFolders(allFolders as WatchedFolder[]);
        if (savedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        }
        setVersion(appVersion);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setFoldersLoading(false);
      }
    }

    load();
  }, []);

  const refreshDownloadToolStatus = useCallback(async () => {
    if (!IS_ELECTRON) {
      return {
        ytdlpInstalled: false,
        ffmpegInstalled: false,
      };
    }

    try {
      const [ytdlpResult, binPath, ffmpegResult, downloadLocationResult] = await Promise.all([
        window.electronAPI.downloader.check(),
        window.electronAPI.downloader.getYtDlpPath(),
        window.electronAPI.downloader.checkFfmpeg(),
        window.electronAPI.downloader.getDownloadLocation(),
      ]);

      setYtdlpInstalled(ytdlpResult.installed);
      setYtdlpVersion(ytdlpResult.version);
      setYtdlpLatestVersion(ytdlpResult.latestVersion);
      setYtdlpUpdateAvailable(Boolean(ytdlpResult.updateAvailable));
      setYtdlpPath(binPath);

      setFfmpegInstalled(ffmpegResult.installed);
      setFfmpegVersion(ffmpegResult.version);
      setFfmpegLatestVersion(ffmpegResult.latestVersion);
      setFfmpegUpdateAvailable(Boolean(ffmpegResult.updateAvailable));
      setDownloadLocation(downloadLocationResult.path);
      setDownloadLocationDefaultPath(downloadLocationResult.defaultPath);
      setDownloadLocationIsDefault(downloadLocationResult.isDefault);

      return {
        ytdlpInstalled: ytdlpResult.installed,
        ffmpegInstalled: ffmpegResult.installed,
      };
    } catch {
      setYtdlpInstalled(false);
      setYtdlpVersion(undefined);
      setYtdlpLatestVersion(undefined);
      setYtdlpUpdateAvailable(false);
      setFfmpegInstalled(false);
      setFfmpegVersion(undefined);
      setFfmpegLatestVersion(undefined);
      setFfmpegUpdateAvailable(false);
      setDownloadLocation('');
      setDownloadLocationDefaultPath('');
      setDownloadLocationIsDefault(true);
      return {
        ytdlpInstalled: false,
        ffmpegInstalled: false,
      };
    }
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    refreshDownloadToolStatus();
  }, [refreshDownloadToolStatus]);

  // Listen for yt-dlp install progress
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onInstallProgress(
      (progress: { percent: number }) => {
        setYtdlpInstallProgress(progress.percent);
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

  const handleInstallYtDlp = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setYtdlpInstalling(true);
    setYtdlpInstallProgress(0);

    try {
      const result = await window.electronAPI.downloader.installYtDlp();
      if (result.success) {
        toast.success('yt-dlp installed successfully', { id: 'ytdlp-install' });
        await refreshDownloadToolStatus();
      } else {
        toast.error(`Failed to install yt-dlp: ${result.error ?? 'Unknown error'}`, {
          id: 'ytdlp-install',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install yt-dlp: ${msg}`, { id: 'ytdlp-install' });
    } finally {
      setYtdlpInstalling(false);
    }
  }, [refreshDownloadToolStatus]);

  const handleInstallFfmpeg = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setFfmpegInstalling(true);
    setFfmpegInstallProgress(0);

    try {
      const result = await window.electronAPI.downloader.installFfmpeg();
      if (result.success) {
        toast.success('ffmpeg installed successfully', { id: 'ffmpeg-install' });
        await refreshDownloadToolStatus();
      } else {
        toast.error(`Failed to install ffmpeg: ${result.error ?? 'Unknown error'}`, {
          id: 'ffmpeg-install',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install ffmpeg: ${msg}`, { id: 'ffmpeg-install' });
    } finally {
      setFfmpegInstalling(false);
    }
  }, [refreshDownloadToolStatus]);

  const handleInstallMissingTools = useCallback(async () => {
    if (!IS_ELECTRON) return;
    startDependencyInstall();

    try {
      const result = await window.electronAPI.downloader.installDependencies();
      const snapshot = await refreshDownloadToolStatus();

      if (result.success) {
        toast.success('Download tools installed successfully', {
          id: 'dependency-install',
        });
      } else if (snapshot.ytdlpInstalled) {
        toast.error(result.error ?? 'ffmpeg could not be installed completely', {
          id: 'dependency-install',
        });
      } else {
        toast.error(result.error ?? 'Failed to install missing tools', {
          id: 'dependency-install',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Installation failed';
      toast.error(`Failed to install missing tools: ${msg}`, {
        id: 'dependency-install',
      });
      await refreshDownloadToolStatus();
    } finally {
      stopDependencyInstall();
    }
  }, [refreshDownloadToolStatus, startDependencyInstall, stopDependencyInstall]);

  const handleChangeDownloadLocation = useCallback(async () => {
    if (!IS_ELECTRON) return;

    try {
      const dirPath = await window.electronAPI.dialog.openDirectory();
      if (!dirPath) return;

      setDownloadLocationUpdating(true);
      const result = await window.electronAPI.downloader.setDownloadLocation(dirPath);
      setDownloadLocation(result.path);
      setDownloadLocationDefaultPath(result.defaultPath);
      setDownloadLocationIsDefault(result.isDefault);
      toast.success('Download location updated', { id: 'download-location' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update download location';
      toast.error(message, { id: 'download-location' });
    } finally {
      setDownloadLocationUpdating(false);
    }
  }, []);

  const handleResetDownloadLocation = useCallback(async () => {
    if (!IS_ELECTRON) return;

    try {
      setDownloadLocationUpdating(true);
      const result = await window.electronAPI.downloader.setDownloadLocation(null);
      setDownloadLocation(result.path);
      setDownloadLocationDefaultPath(result.defaultPath);
      setDownloadLocationIsDefault(result.isDefault);
      toast.success('Download location reset to default', { id: 'download-location' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset download location';
      toast.error(message, { id: 'download-location' });
    } finally {
      setDownloadLocationUpdating(false);
    }
  }, []);

  const handleAddFolder = useCallback(async () => {
    if (!IS_ELECTRON) return;
    try {
      const dirPath = await window.electronAPI.dialog.openDirectory();
      if (!dirPath) return;

      // Check if folder already exists
      const existing = folders.find((f) => f.path === dirPath);
      if (existing) {
        toast.info('This folder is already in your library');
        return;
      }

      const result = (await window.electronAPI.db.folders.add(dirPath)) as WatchedFolder;
      setFolders((prev) => [...prev, result]);

      // Scan the new folder
      setIsScanning(true);
      try {
        const results = await window.electronAPI.library.scanFolder(dirPath);
        if (results.length === 0) {
          toast.info('No audio files found in folder');
          return;
        }

        // Filter out tracks already in library
        const existingPaths = new Set(usePlayerStore.getState().library.map((t) => t.filePath));
        const newResults = results.filter((r) => !existingPaths.has(r.filePath));

        // Also check DB
        const toCheck = await Promise.all(
          newResults.map(async (r) => ({
            result: r,
            exists: await window.electronAPI.db.tracks.exists(r.filePath),
          }))
        );
        const genuinelyNew = toCheck.filter((c) => !c.exists).map((c) => c.result);

        if (genuinelyNew.length === 0) {
          toast.info('All tracks already in library');
          return;
        }

        const dbTracks = (await window.electronAPI.db.tracks.addMany(
          genuinelyNew.map((r) => ({
            filePath: r.filePath,
            title: r.metadata.title,
            artist: r.metadata.artist,
            album: r.metadata.album,
            duration: r.metadata.duration,
            genre: r.metadata.genre ?? null,
            year: r.metadata.year ?? null,
            trackNumber: r.metadata.trackNumber ?? null,
            albumArt: r.metadata.albumArt ?? null,
          }))
        )) as Record<string, unknown>[];

        const newTracks: Track[] = dbTracks.map((t) => ({
          id: t.id as string,
          title: t.title as string,
          artist: (t.artist as string) ?? 'Unknown Artist',
          album: (t.album as string) ?? 'Unknown Album',
          duration: (t.duration as number) ?? 0,
          filePath: t.filePath as string,
          albumArt: (t.albumArt as string | null) ?? undefined,
          genre: t.genre as string | null | undefined,
          year: t.year as number | null | undefined,
          trackNumber: t.trackNumber as number | null | undefined,
          isFavorite: (t.isFavorite as boolean) ?? false,
          playCount: (t.playCount as number) ?? 0,
          createdAt: t.createdAt as string | undefined,
          updatedAt: t.updatedAt as string | undefined,
        }));

        addToLibrary(newTracks);

        const currentQueue = usePlayerStore.getState().queue;
        const currentPlaying = usePlayerStore.getState().currentTrack;
        const combined = [...currentQueue, ...newTracks];
        if (!currentPlaying) {
          usePlayerStore.getState().setQueue(combined, 0);
        } else {
          usePlayerStore.setState({ queue: combined });
        }

        toast.success(`Added ${newTracks.length} track${newTracks.length === 1 ? '' : 's'} to library`);
      } finally {
        setIsScanning(false);
      }
    } catch (err) {
      console.error('Failed to add folder:', err);
      toast.error('Failed to add folder');
      setIsScanning(false);
    }
  }, [addToLibrary, folders]);

  const handleRemoveFolder = useCallback(async (folder: WatchedFolder) => {
    if (!IS_ELECTRON) return;
    try {
      await window.electronAPI.db.folders.remove(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      toast.success('Folder removed from watch list');
    } catch (err) {
      console.error('Failed to remove folder:', err);
      toast.error('Failed to remove folder');
    }
  }, []);

  const handleRescan = useCallback(async () => {
    if (!IS_ELECTRON || folders.length === 0) return;
    setIsScanning(true);
    let totalAdded = 0;

    try {
      for (const folder of folders) {
        try {
          const results = await window.electronAPI.library.scanFolder(folder.path);
          if (results.length === 0) continue;

          const existingPaths = new Set(usePlayerStore.getState().library.map((t) => t.filePath));
          const newResults = results.filter((r) => !existingPaths.has(r.filePath));

          const toCheck = await Promise.all(
            newResults.map(async (r) => ({
              result: r,
              exists: await window.electronAPI.db.tracks.exists(r.filePath),
            }))
          );
          const genuinelyNew = toCheck.filter((c) => !c.exists).map((c) => c.result);
          if (genuinelyNew.length === 0) continue;

          const dbTracks = (await window.electronAPI.db.tracks.addMany(
            genuinelyNew.map((r) => ({
              filePath: r.filePath,
              title: r.metadata.title,
              artist: r.metadata.artist,
              album: r.metadata.album,
              duration: r.metadata.duration,
              genre: r.metadata.genre ?? null,
              year: r.metadata.year ?? null,
              trackNumber: r.metadata.trackNumber ?? null,
              albumArt: r.metadata.albumArt ?? null,
            }))
          )) as Record<string, unknown>[];

          const newTracks: Track[] = dbTracks.map((t) => ({
            id: t.id as string,
            title: t.title as string,
            artist: (t.artist as string) ?? 'Unknown Artist',
            album: (t.album as string) ?? 'Unknown Album',
            duration: (t.duration as number) ?? 0,
            filePath: t.filePath as string,
            albumArt: (t.albumArt as string | null) ?? undefined,
            genre: t.genre as string | null | undefined,
            year: t.year as number | null | undefined,
            trackNumber: t.trackNumber as number | null | undefined,
            isFavorite: (t.isFavorite as boolean) ?? false,
            playCount: (t.playCount as number) ?? 0,
            createdAt: t.createdAt as string | undefined,
            updatedAt: t.updatedAt as string | undefined,
          }));

          addToLibrary(newTracks);

          const currentQueue = usePlayerStore.getState().queue;
          const currentPlaying = usePlayerStore.getState().currentTrack;
          const combined = [...currentQueue, ...newTracks];
          if (!currentPlaying) {
            usePlayerStore.getState().setQueue(combined, 0);
          } else {
            usePlayerStore.setState({ queue: combined });
          }

          totalAdded += newTracks.length;

          // Update last scanned timestamp
          await window.electronAPI.db.folders.updateScanned(folder.id);
        } catch {
          // Skip folders that fail to scan (e.g., deleted directories)
        }
      }

      if (totalAdded > 0) {
        toast.success(`Found ${totalAdded} new track${totalAdded === 1 ? '' : 's'}`);
      } else {
        toast.info('Library is up to date');
      }

      // Refresh folders to get updated timestamps
      const updatedFolders = (await window.electronAPI.db.folders.getAll()) as WatchedFolder[];
      setFolders(updatedFolders);
    } catch (err) {
      console.error('Rescan failed:', err);
      toast.error('Failed to rescan library');
    } finally {
      setIsScanning(false);
    }
  }, [addToLibrary, folders]);

  const handleClearLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setIsClearing(true);
    try {
      const allTracks = usePlayerStore.getState().library;
      if (allTracks.length > 0) {
        await window.electronAPI.db.tracks.removeMany(allTracks.map((t) => t.id));
      }
      clearQueue();
      usePlayerStore.setState({ library: [] });
      setConfirmClear(false);
      toast.success('Library cleared');
    } catch (err) {
      console.error('Failed to clear library:', err);
      toast.error('Failed to clear library');
    } finally {
      setIsClearing(false);
    }
  }, [clearQueue]);

  const updateSetting = useCallback(
    async (key: keyof SettingsData, value: boolean) => {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      if (IS_ELECTRON) {
        try {
          await window.electronAPI.store.set('settings', updated);
        } catch (err) {
          console.error('Failed to save settings:', err);
        }
      }
    },
    [settings]
  );

  const isCheckingDownloadTools =
    ytdlpInstalled === null || ffmpegInstalled === null;
  const hasMissingDownloadTools =
    ytdlpInstalled === false || ffmpegInstalled === false;
  const dependenciesInstalling = isDependencyInstallInProgress;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Page header */}
          <div className="mb-2">
            <h1 className="font-display text-xl font-semibold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your library, playback preferences, and more
            </p>
          </div>

          {/* Music Folders */}
          <section className="rounded-2xl bg-surface/50 border border-border/30 p-5">
            <SectionHeader
              icon={FolderOpen}
              title="Music Folders"
              description="Directories that Shiranami watches for audio files"
            />

            {foldersLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm">Loading folders...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {folders.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 py-3 text-center">
                    No folders added yet
                  </p>
                ) : (
                  folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20 group"
                    >
                      <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate flex-1 font-mono">
                        {folder.path}
                      </span>
                      <button
                        onClick={() => handleRemoveFolder(folder)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Remove folder"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}

                <button
                  onClick={handleAddFolder}
                  disabled={isScanning}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/10 transition-colors w-full justify-center border border-dashed border-border/40 hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isScanning ? 'Scanning...' : 'Add Folder'}
                </button>
              </div>
            )}
          </section>

          {/* Library */}
          <section className="rounded-2xl bg-surface/50 border border-border/30 p-5">
            <SectionHeader
              icon={HardDrive}
              title="Library"
              description="Manage your music collection"
            />

            <div className="space-y-4">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
                <Music className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Total tracks</span>
                <span className="ml-auto text-sm font-medium text-foreground tabular-nums">
                  {library.length.toLocaleString()}
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRescan}
                  disabled={isScanning || folders.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScanning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {isScanning ? 'Scanning...' : 'Rescan Library'}
                </button>

                {!confirmClear ? (
                  <button
                    onClick={() => setConfirmClear(true)}
                    disabled={library.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Library
                  </button>
                ) : (
                  <div className="flex-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                    <p className="text-sm text-foreground">
                      This will remove all{' '}
                      <span className="font-semibold">{library.length.toLocaleString()}</span>{' '}
                      tracks from your library. Audio files on disk won't be deleted.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearLibrary}
                        disabled={isClearing}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                      >
                        {isClearing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        {isClearing ? 'Clearing...' : 'Yes, clear everything'}
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Downloads */}
          <section className="rounded-2xl bg-surface/50 border border-border/30 p-5">
            <SectionHeader
              icon={ArrowDownToLine}
              title="Downloads"
              description="yt-dlp integration for searching and downloading music"
            />

            <div className="space-y-3">
              {isCheckingDownloadTools ? (
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-background/50 border border-border/20 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking download tools...</span>
                </div>
              ) : (
                <>
                  {hasMissingDownloadTools && (
                    <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4 space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Install missing tools in one pass
                        </p>
                        <p className="text-xs text-muted-foreground leading-5">
                          Shiranami will download yt-dlp and ffmpeg, then unpack everything it
                          needs automatically.
                        </p>
                      </div>

                      {dependenciesInstalling ? (
                        <div className="space-y-2">
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
                      ) : (
                        <button
                          onClick={handleInstallMissingTools}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          Install Missing Tools
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
                    {ytdlpInstalled ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-foreground">yt-dlp installed</span>
                        {ytdlpUpdateAvailable ? (
                          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-amber-300">
                            Update available
                          </span>
                        ) : (
                          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            Up to date
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">yt-dlp not installed</span>
                      </>
                    )}
                  </div>

                  {ytdlpPath && (
                    <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20">
                      <p className="text-xs text-muted-foreground mb-1">Binary path</p>
                      <p className="text-xs text-foreground font-mono truncate">{ytdlpPath}</p>
                    </div>
                  )}

                  <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">Installed version</p>
                      <p className="ml-auto text-xs text-foreground font-mono tabular-nums">
                        {ytdlpVersion ? `v${ytdlpVersion}` : ytdlpInstalled ? 'Unknown' : 'Not installed'}
                      </p>
                    </div>
                    {ytdlpLatestVersion && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">Latest release</p>
                        <p className="ml-auto text-xs text-foreground font-mono tabular-nums">
                          v{ytdlpLatestVersion}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="px-3 py-3 rounded-xl bg-background/50 border border-border/20 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">Download location</p>
                        <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                          {downloadLocationIsDefault ? 'Default' : 'Custom'}
                        </span>
                      </div>
                      <p className="text-xs text-foreground font-mono break-all">
                        {downloadLocation || downloadLocationDefaultPath || 'Loading...'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        Search downloads are saved here automatically.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleChangeDownloadLocation}
                        disabled={downloadLocationUpdating}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloadLocationUpdating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderOpen className="w-3.5 h-3.5" />
                        )}
                        Change location
                      </button>

                      {!downloadLocationIsDefault && (
                        <button
                          onClick={handleResetDownloadLocation}
                          disabled={downloadLocationUpdating}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reset to default
                        </button>
                      )}
                    </div>
                  </div>

                  {ytdlpInstalling ? (
                    <div className="space-y-2 px-1">
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${ytdlpInstallProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Downloading yt-dlp... {ytdlpInstallProgress}%
                      </p>
                    </div>
                  ) : ytdlpInstalled && ytdlpUpdateAvailable ? (
                    <button
                      onClick={handleInstallYtDlp}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Update yt-dlp
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 px-1">
                      {ytdlpInstalled
                        ? 'yt-dlp is already on the latest release.'
                        : 'Install missing tools above to add yt-dlp.'}
                    </p>
                  )}

                  <div className="border-t border-border/20 pt-3 mt-3" />

                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
                    {ffmpegInstalled ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-foreground">ffmpeg installed</span>
                        {ffmpegUpdateAvailable ? (
                          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-amber-300">
                            Update available
                          </span>
                        ) : (
                          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            Up to date
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">ffmpeg not installed</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/60">recommended</span>
                      </>
                    )}
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">Installed version</p>
                      <p className="ml-auto text-xs text-foreground font-mono tabular-nums">
                        {ffmpegVersion ?? (ffmpegInstalled ? 'Unknown' : 'Not installed')}
                      </p>
                    </div>
                    {ffmpegLatestVersion && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">Latest release</p>
                        <p className="ml-auto text-xs text-foreground font-mono tabular-nums">
                          {ffmpegLatestVersion}
                        </p>
                      </div>
                    )}
                  </div>

                  {!ffmpegInstalled && (
                    <p className="text-xs text-muted-foreground/60 px-1">
                      ffmpeg enables MP3 conversion and thumbnail embedding for downloads.
                      Without it, audio downloads as webm or opus.
                    </p>
                  )}

                  {ffmpegInstalling ? (
                    <div className="space-y-2 px-1">
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${ffmpegInstallProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Downloading ffmpeg... {ffmpegInstallProgress}%
                      </p>
                    </div>
                  ) : ffmpegInstalled && ffmpegUpdateAvailable ? (
                    <button
                      onClick={handleInstallFfmpeg}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Update ffmpeg
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 px-1">
                      {ffmpegInstalled
                        ? 'ffmpeg is already on the latest release.'
                        : 'Install missing tools above to add ffmpeg automatically.'}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Playback */}
          <section className="rounded-2xl bg-surface/50 border border-border/30 p-5">
            <SectionHeader
              icon={Settings2}
              title="Playback"
              description="Audio playback preferences"
            />

            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">Remember playback position</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Resume tracks from where you left off
                  </p>
                </div>
                <Toggle
                  checked={settings.rememberPlaybackPosition}
                  onChange={(v) => updateSetting('rememberPlaybackPosition', v)}
                />
              </div>

              <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">Gapless playback</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Seamless transitions between tracks
                  </p>
                </div>
                <Toggle
                  checked={settings.gaplessPlayback}
                  onChange={(v) => updateSetting('gaplessPlayback', v)}
                />
              </div>
            </div>
          </section>

          {/* About */}
          <section className="rounded-2xl bg-surface/50 border border-border/30 p-5">
            <SectionHeader
              icon={Info}
              title="About"
              description="Application information"
            />

            <div className="flex items-center gap-4 px-3 py-3">
              <img
                src="./mascot.png"
                alt="Shiranami mascot"
                className="w-16 h-16 rounded-2xl object-contain"
                draggable={false}
              />
              <div>
                <h4 className="font-display text-base font-semibold text-foreground">
                  Shiranami
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  Version {version}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1 italic">
                  白波 &mdash; Your personal music sanctuary
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-2">
                  Made with &#9829;
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
