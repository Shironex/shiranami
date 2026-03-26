import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import { FolderOpen, X, Plus, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { mapDbTracksToTracks } from '@/lib/trackMapper';

export interface WatchedFolder {
  id: string;
  path: string;
  lastScannedAt?: string;
}

export function MusicFoldersSection() {
  const { t } = useTranslation('settings');
  const { t: tToast } = useTranslation('toast');
  const addToLibrary = usePlayerStore(s => s.addToLibrary);

  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  // Load folders on mount
  useEffect(() => {
    if (!IS_ELECTRON) {
      setFoldersLoading(false);
      return;
    }

    async function load() {
      try {
        const allFolders = await window.electronAPI.db.folders.getAll();
        setFolders(allFolders as WatchedFolder[]);
      } catch (err) {
        console.error('Failed to load folders:', err);
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
      const existing = folders.find(f => f.path === dirPath);
      if (existing) {
        toast.info(tToast('folderAlreadyExists'));
        return;
      }

      const result = (await window.electronAPI.db.folders.add(dirPath)) as WatchedFolder;
      setFolders(prev => [...prev, result]);

      // Scan the new folder
      setIsScanning(true);
      try {
        const results = await window.electronAPI.library.scanFolder(dirPath);
        if (results.length === 0) {
          toast.info(tToast('noAudioInFolder'));
          return;
        }

        // Filter out tracks already in library
        const existingPaths = new Set(usePlayerStore.getState().library.map(t => t.filePath));
        const newResults = results.filter(r => !existingPaths.has(r.filePath));

        // Also check DB
        const toCheck = await Promise.all(
          newResults.map(async r => ({
            result: r,
            exists: await window.electronAPI.db.tracks.exists(r.filePath),
          }))
        );
        const genuinelyNew = toCheck.filter(c => !c.exists).map(c => c.result);

        if (genuinelyNew.length === 0) {
          toast.info(tToast('allTracksExist'));
          return;
        }

        const dbTracks = (await window.electronAPI.db.tracks.addMany(
          genuinelyNew.map(r => ({
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

        const newTracks = mapDbTracksToTracks(dbTracks);

        addToLibrary(newTracks);

        const currentQueue = usePlayerStore.getState().queue;
        const currentPlaying = usePlayerStore.getState().currentTrack;
        const combined = [...currentQueue, ...newTracks];
        if (!currentPlaying) {
          usePlayerStore.getState().setQueue(combined, 0);
        } else {
          usePlayerStore.setState({ queue: combined });
        }

        toast.success(tToast('addedTracks', { count: newTracks.length }));
      } finally {
        setIsScanning(false);
      }
    } catch (err) {
      console.error('Failed to add folder:', err);
      toast.error(tToast('failedAddFolder'));
      setIsScanning(false);
    }
  }, [addToLibrary, folders, tToast]);

  const handleRemoveFolder = useCallback(
    async (folder: WatchedFolder) => {
      if (!IS_ELECTRON) return;
      try {
        await window.electronAPI.db.folders.remove(folder.id);
        setFolders(prev => prev.filter(f => f.id !== folder.id));
        toast.success(tToast('folderRemoved'));
      } catch (err) {
        console.error('Failed to remove folder:', err);
        toast.error(tToast('failedRemoveFolder'));
      }
    },
    [tToast]
  );

  return (
    <SettingsCard icon={FolderOpen} title={t('folders.title')} subtitle={t('folders.subtitle')}>
      {foldersLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">{t('folders.loading')}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {folders.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 py-3 text-center">
              {t('folders.empty')}
            </p>
          ) : (
            folders.map(folder => (
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
                  title={t('folders.remove')}
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
            {isScanning ? t('folders.scanning') : t('folders.addFolder')}
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
