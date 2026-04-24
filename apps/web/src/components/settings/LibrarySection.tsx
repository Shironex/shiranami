import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { HardDrive, Music, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { isScanLocked } from '@/lib/scanLock';
import { MetadataEnrichSection } from '@/components/settings/MetadataEnrichSection';

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
          <button
            onClick={rescan}
            disabled={isScanning || isScanLocked()}
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
                  onClick={clearLibrary}
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

      <MetadataEnrichSection />

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
