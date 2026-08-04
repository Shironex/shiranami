import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { isScanLocked } from '@/lib/scanLock';
import { IS_ELECTRON } from '@/lib/platform';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';
import type { ILibrarySectionView } from './LibrarySection.types';

export function useLibrarySection(): ILibrarySectionView {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const library = useLibraryStore(s => s.library);

  const {
    isScanning,
    isClearing,
    confirmClear,
    setConfirmClear,
    rescan,
    clearLibrary,
    detectedSubfolders,
    existingPlaylistNames,
    clearDetectedSubfolders,
  } = useLibraryRescan();

  const onSubfolderConfirm = useSubfolderPlaylistConfirm();
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const onExport = async (): Promise<void> => {
    if (!IS_ELECTRON) return;
    setExporting(true);
    try {
      const result = await window.electronAPI.db.backup.export();
      if (result.success) {
        toast.success(t('lib.backupExported'));
      } else if (result.error) {
        toast.error(t('lib.backupExportFailed', { error: result.error }));
      }
      // No toast on a plain user-cancel (no success, no error).
    } catch {
      toast.error(t('lib.backupExportFailed', { error: '' }));
    } finally {
      setExporting(false);
    }
  };

  const onImport = async (): Promise<void> => {
    if (!IS_ELECTRON) return;
    setImporting(true);
    try {
      const result = await window.electronAPI.db.backup.import();
      if (result.success) {
        // The live DB was replaced + re-migrated in the main process; reload
        // the in-memory library so the UI reflects the imported data.
        const allDbTracks = await window.electronAPI.db.tracks.getAll();
        useLibraryStore.getState().setLibrary(mapDbTracksToTracks(allDbTracks as DbTrackRecord[]));
        toast.success(t('lib.backupImported'));
      } else if (result.error) {
        toast.error(t('lib.backupImportFailed', { error: result.error }));
      }
    } catch {
      toast.error(t('lib.backupImportFailed', { error: '' }));
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (detectedSubfolders.length > 0) {
      setSubfolderDialogOpen(true);
    }
  }, [detectedSubfolders]);

  const onDialogOpenChange = (open: boolean): void => {
    setSubfolderDialogOpen(open);
    if (!open) clearDetectedSubfolders();
  };

  const trackCountLabel = library.length.toLocaleString();

  return {
    t,
    tc,
    isElectron: IS_ELECTRON,
    // Feature-detected, not merely platform-gated: `analysis` and `doctor`
    // are v2-only optional members of the shared preload contract.
    showAnalysis: IS_ELECTRON && window.electronAPI.analysis != null && library.length > 0,
    showDoctor: IS_ELECTRON && window.electronAPI.doctor != null && library.length > 0,
    trackCount: library.length,
    trackCountLabel,
    hasTracks: library.length > 0,

    isScanning,
    isRescanDisabled: isScanning || isScanLocked(),
    isClearing,
    confirmClear,
    clearConfirmLabel: t('lib.clearConfirm', { count: trackCountLabel }),
    onRescan: rescan,
    onClearLibrary: clearLibrary,
    onSetConfirmClear: setConfirmClear,

    isExporting: exporting,
    isImporting: importing,
    isBackupBusy: exporting || importing,
    onExport: () => void onExport(),
    onImport: () => void onImport(),

    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onDialogOpenChange,
    onSubfolderConfirm,
  };
}
