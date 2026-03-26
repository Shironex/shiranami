import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import { HardDrive, Music, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import type { WatchedFolder } from '@/components/settings/MusicFoldersSection';

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

  const handleRescan = useCallback(async () => {
    if (!IS_ELECTRON) return;

    // Fetch folders directly so we don't depend on MusicFoldersSection state
    let folders: WatchedFolder[];
    try {
      folders = (await window.electronAPI.db.folders.getAll()) as WatchedFolder[];
    } catch {
      toast.error(tToast('failedLoadFolders'));
      return;
    }

    if (folders.length === 0) return;
    setIsScanning(true);
    let totalAdded = 0;

    try {
      for (const folder of folders) {
        try {
          const results = await window.electronAPI.library.scanFolder(folder.path);
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

          const newTracks: Track[] = dbTracks.map(t => ({
            id: t.id as string,
            title: t.title as string,
            artist: (t.artist as string) ?? tc('unknownArtist'),
            album: (t.album as string) ?? tc('unknownAlbum'),
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
        toast.success(tToast('foundNewTracks', { count: totalAdded }));
      } else {
        toast.info(tToast('libraryUpToDate'));
      }
    } catch (err) {
      console.error('Rescan failed:', err);
      toast.error(tToast('failedRescan'));
    } finally {
      setIsScanning(false);
    }
  }, [addToLibrary, tToast]);

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
  );
}
