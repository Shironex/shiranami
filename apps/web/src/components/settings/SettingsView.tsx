import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
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
  const queue = usePlayerStore((s) => s.queue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [version, setVersion] = useState('0.1.0');
  const [isScanning, setIsScanning] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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

        // Filter out tracks already in queue
        const existingPaths = new Set(usePlayerStore.getState().queue.map((t) => t.filePath));
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
  }, [folders]);

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

          const existingPaths = new Set(usePlayerStore.getState().queue.map((t) => t.filePath));
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
  }, [folders]);

  const handleClearLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setIsClearing(true);
    try {
      const allTracks = usePlayerStore.getState().queue;
      if (allTracks.length > 0) {
        await window.electronAPI.db.tracks.removeMany(allTracks.map((t) => t.id));
      }
      clearQueue();
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
                  {queue.length.toLocaleString()}
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
                    disabled={queue.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Library
                  </button>
                ) : (
                  <div className="flex-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                    <p className="text-sm text-foreground">
                      This will remove all{' '}
                      <span className="font-semibold">{queue.length.toLocaleString()}</span>{' '}
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
