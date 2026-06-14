import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { scanAndPersistFolder } from '@/lib/scanHelpers';
import { queryClient } from '@/lib/queryClient';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { folderKeys } from '@/hooks/queries/useFolders';

export function useLibraryActions() {
  const [isScanning, setIsScanning] = useState(false);
  const { importTrack } = useTrackImport();

  const handleOpenFile = useCallback(async () => {
    if (!IS_ELECTRON) return;
    try {
      const filePath = await window.electronAPI.dialog.openFile();
      if (!filePath) return;

      const track = await importTrack(filePath);
      if (!track) {
        toast.info(i18n.t('trackAlreadyInLibrary', { ns: 'toast' }));
        return;
      }

      toast.success(i18n.t('added1Track', { ns: 'toast' }));
    } catch (err) {
      logger.error('Failed to add file:', err);
      toast.error(i18n.t('failedAddTrack', { ns: 'toast' }));
    }
  }, [importTrack]);

  const handleOpenFolder = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const dirPath = await window.electronAPI.dialog.openDirectory();
    if (!dirPath) return;
    setIsScanning(true);
    try {
      // Delegate scan + dedup + persist to the shared helper. It uses the
      // grouped scan, a batched existsMany (no per-file N+1), and carries the
      // albumArtist tag through so untagged various-artists albums group
      // correctly.
      const result = await scanAndPersistFolder(dirPath);

      if (result.empty) {
        toast.info(i18n.t('noAudioInFolder', { ns: 'toast' }));
        return;
      }

      if (result.allExisted) {
        toast.info(i18n.t('allTracksExist', { ns: 'toast' }));
        return;
      }

      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      toast.success(i18n.t('addedTracks', { ns: 'toast', count: result.addedCount }));
    } catch (err) {
      logger.error('Failed to add folder:', err);
      toast.error(i18n.t('failedScanFolder', { ns: 'toast' }));
    } finally {
      setIsScanning(false);
    }
  }, []);

  return { handleOpenFile, handleOpenFolder, isScanning };
}
