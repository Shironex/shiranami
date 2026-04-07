import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import { HardDrive, Music, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';
import { mapDbTracksToTracks } from '@/lib/trackMapper';
import { queryClient } from '@/lib/queryClient';
import { folderKeys } from '@/hooks/queries/useFolders';
import { useCreatePlaylistsFromSubfoldersMutation } from '@/hooks/queries/usePlaylists';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import type { TrackMetadata } from '@/types/electron';

export function LibrarySection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const library = usePlayerStore(s => s.library);
  const addToLibrary = usePlayerStore(s => s.addToLibrary);
  const clearQueue = usePlayerStore(s => s.clearQueue);

  const [confirmClear, setConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [detectedSubfolders, setDetectedSubfolders] = useState<
    Array<{ name: string; path: string; tracks: Array<{ filePath: string; metadata: TrackMetadata }> }>
  >([]);
  const createPlaylistsMutation = useCreatePlaylistsFromSubfoldersMutation();

  const handleRescan = useCallback(async () => {
    if (!IS_ELECTRON) return;

    let folders: WatchedFolder[];
    try {
      folders = await queryClient.fetchQuery({
        queryKey: folderKeys.all,
        queryFn: async () => (await window.electronAPI.db.folders.getAll()) as WatchedFolder[],
      });
    } catch {
      toast.error(tToast('failedLoadFolders'));
      return;
    }

    if (folders.length === 0) return;
    setIsScanning(true);
    let totalAdded = 0;
    const allDetectedSubfolders: Array<{ name: string; path: string; tracks: Array<{ filePath: string; metadata: TrackMetadata }> }> = [];

    try {
      for (const folder of folders) {
        try {
          const { rootTracks, subfolders: scannedSubfolders } =
            await window.electronAPI.library.scanFolderGrouped(folder.path);

          // Combine root tracks with all subfolder tracks for the flat track list
          const results = [
            ...rootTracks,
            ...scannedSubfolders.flatMap(sf => sf.tracks),
          ];

          if (scannedSubfolders.length > 0) {
            allDetectedSubfolders.push(...scannedSubfolders);
          }

          if (results.length === 0) continue;

          const existingPaths = new Set(usePlayerStore.getState().library.map(t => t.filePath));
          const newResults = results.filter(r => !existingPaths.has(r.filePath));

          const toCheck = await Promise.all(
            newResults.map(async r => ({
              result: r,
              exists: await window.electronAPI.db.tracks.exists(r.filePath),
            }))
          );
          const genuinelyNew = toCheck.filter(c => !c.exists).map(c => c.result);
          if (genuinelyNew.length === 0) continue;

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

          totalAdded += newTracks.length;

          // Update last scanned timestamp
          await window.electronAPI.db.folders.updateScanned(folder.id);
        } catch {
          // Skip folders that fail to scan (e.g., deleted directories)
        }
      }

      if (totalAdded > 0) {
        toast.success(tToast('foundNewTracks', { count: totalAdded }));
      } else {
        toast.info(tToast('libraryUpToDate'));
      }

      // Show subfolder playlist dialog only if there are subfolders without existing playlists
      if (allDetectedSubfolders.length > 0) {
        const newSubfolders: typeof allDetectedSubfolders = [];
        for (const sf of allDetectedSubfolders) {
          try {
            const existing = await window.electronAPI.db.playlists.getByName(sf.name);
            if (!existing) newSubfolders.push(sf);
          } catch {
            newSubfolders.push(sf); // include on lookup failure
          }
        }
        if (newSubfolders.length > 0) {
          setDetectedSubfolders(newSubfolders);
          setSubfolderDialogOpen(true);
        }
      }
    } catch (err) {
      console.error('Rescan failed:', err);
      toast.error(tToast('failedRescan'));
    } finally {
      setIsScanning(false);
    }
  }, [addToLibrary, tToast]);

  const handleSubfolderConfirm = useCallback(
    async (selectedSubfolders: Array<{ name: string; path: string; tracks: Array<{ filePath: string; metadata: TrackMetadata }> }>) => {
      if (!IS_ELECTRON) return;
      try {
        const libraryTracks = usePlayerStore.getState().library;
        const pathToId = new Map(libraryTracks.map(t => [t.filePath, t.id]));

        const subfolderData = selectedSubfolders.map(sf => ({
          name: sf.name,
          trackIds: sf.tracks
            .map(track => pathToId.get(track.filePath))
            .filter((id): id is string => !!id),
        }));

        const created = await createPlaylistsMutation.mutateAsync(
          subfolderData.filter(sf => sf.trackIds.length > 0)
        );

        if (created.length > 0) {
          toast.success(tToast('playlistsCreatedFromSubfolders', { count: created.length }));
        } else {
          toast.info(tToast('noNewSubfolders'));
        }
      } catch (err) {
        console.error('Failed to create playlists from subfolders:', err);
        toast.error(tToast('playlistsCreationFailed'));
      }
    },
    [createPlaylistsMutation, tToast]
  );

  const handleClearLibrary = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setIsClearing(true);
    try {
      const allTracks = usePlayerStore.getState().library;
      if (allTracks.length > 0) {
        await window.electronAPI.db.tracks.removeMany(allTracks.map(t => t.id));
      }
      clearQueue();
      usePlayerStore.setState({ library: [] });
      setConfirmClear(false);
      toast.success(tToast('libraryCleared'));
    } catch (err) {
      console.error('Failed to clear library:', err);
      toast.error(tToast('failedClearLibrary'));
    } finally {
      setIsClearing(false);
    }
  }, [clearQueue, tToast]);

  return (
    <>
    <SettingsCard icon={HardDrive} title={t('lib.title')} subtitle={t('lib.subtitle')}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
          <Music className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground">{t('lib.totalTracks')}</span>
          <span className="ml-auto text-sm font-medium text-foreground tabular-nums">
            {library.length.toLocaleString()}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {isScanning ? t('lib.scanning') : t('lib.rescan')}
          </button>

          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              disabled={library.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('lib.clearLibrary')}
            </button>
          ) : (
            <div className="flex-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-3">
              <p className="text-sm text-foreground">
                {t('lib.clearConfirm', { count: library.length.toLocaleString() })}
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
                  {isClearing ? t('lib.clearing') : t('lib.yesClear')}
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {tc('cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsCard>

      <SubfolderPlaylistDialog
        open={subfolderDialogOpen}
        onOpenChange={setSubfolderDialogOpen}
        subfolders={detectedSubfolders}
        onConfirm={handleSubfolderConfirm}
      />
    </>
  );
}
