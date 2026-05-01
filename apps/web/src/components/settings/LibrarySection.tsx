import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { HardDrive, Music, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
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
            <Button
              variant="secondary"
              onClick={rescan}
              disabled={isScanning || isScanLocked()}
              className="rounded-xl [&_svg]:size-3.5"
            >
              {isScanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {isScanning ? t('lib.scanning') : t('lib.rescan')}
            </Button>

            {!confirmClear ? (
              <Button
                variant="destructiveGhost"
                onClick={() => setConfirmClear(true)}
                disabled={library.length === 0}
                className="rounded-xl [&_svg]:size-3.5"
              >
                <Trash2 />
                {t('lib.clearLibrary')}
              </Button>
            ) : (
              <div className="flex-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-3">
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
