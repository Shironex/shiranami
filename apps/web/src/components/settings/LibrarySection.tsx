import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore } from '@/stores/useLibraryStore';
import {
  HardDrive,
  Music,
  RefreshCw,
  Trash2,
  Loader2,
  Download,
  Upload,
  DatabaseBackup,
} from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { isScanLocked } from '@/lib/scanLock';
import { IS_ELECTRON } from '@/lib/platform';
import { ScanProgressCard } from '@/components/library/ScanProgressCard';
import { DiskUsageSection } from '@/components/settings/DiskUsageSection';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';

export function LibrarySection() {
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

  const handleSubfolderConfirm = useSubfolderPlaylistConfirm();
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
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

  const handleImport = async () => {
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

  const handleDialogOpenChange = (open: boolean) => {
    setSubfolderDialogOpen(open);
    if (!open) clearDetectedSubfolders();
  };

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
            <Button
              variant="secondary"
              onClick={rescan}
              disabled={isScanning || isScanLocked()}
              className="rounded-xl [&_svg]:size-3.5"
            >
              {isScanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {isScanning ? t('lib.scanning') : t('lib.rescan')}
            </Button>
          </div>

          <ScanProgressCard />
        </div>
      </SettingsCard>

      {IS_ELECTRON && <DiskUsageSection />}

      {IS_ELECTRON && (
        <SettingsCard
          icon={DatabaseBackup}
          title={t('lib.backupTitle')}
          subtitle={t('lib.backupSubtitle')}
        >
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={exporting || importing}
              className="rounded-xl [&_svg]:size-3.5"
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {t('lib.backupExport')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleImport}
              disabled={exporting || importing}
              className="rounded-xl [&_svg]:size-3.5"
            >
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              {t('lib.backupImport')}
            </Button>
          </div>
        </SettingsCard>
      )}

      {library.length > 0 && (
        <SettingsCard
          tone="destructive"
          icon={Trash2}
          title={t('lib.dangerZone')}
          subtitle={t('lib.dangerZoneSubtitle')}
        >
          {!confirmClear ? (
            <Button
              variant="destructiveGhost"
              onClick={() => setConfirmClear(true)}
              className="rounded-xl [&_svg]:size-3.5"
            >
              <Trash2 />
              {t('lib.clearLibrary')}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                {t('lib.clearConfirm', { count: library.length.toLocaleString() })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={clearLibrary}
                  disabled={isClearing}
                  className="gap-2 rounded-lg text-sm [&_svg]:size-3.5"
                >
                  {isClearing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {isClearing ? t('lib.clearing') : t('lib.yesClear')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg text-sm text-muted-foreground"
                >
                  {tc('cancel')}
                </Button>
              </div>
            </div>
          )}
        </SettingsCard>
      )}

      <SubfolderPlaylistDialog
        open={subfolderDialogOpen}
        onOpenChange={handleDialogOpenChange}
        subfolders={detectedSubfolders}
        onConfirm={handleSubfolderConfirm}
        existingPlaylistNames={existingPlaylistNames}
      />
    </>
  );
}
