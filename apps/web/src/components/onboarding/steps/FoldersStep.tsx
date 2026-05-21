import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { FolderOpen, Plus, Loader2, X } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { isScanLocked } from '@/lib/scanLock';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useLibraryFolders } from '@/hooks/useLibraryFolders';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ScanProgressCard } from '@/components/library/ScanProgressCard';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

export function FoldersStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();

  const { data: folders = [] } = useFoldersQuery();
  const {
    isScanning,
    addFolder,
    removeFolder,
    detectedSubfolders,
    existingPlaylistNames,
    clearDetectedSubfolders,
  } = useLibraryFolders();

  const handleSubfolderConfirm = useSubfolderPlaylistConfirm();
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);

  useEffect(() => {
    if (detectedSubfolders.length > 0) setSubfolderDialogOpen(true);
  }, [detectedSubfolders]);

  const handleDialogOpenChange = (open: boolean) => {
    setSubfolderDialogOpen(open);
    if (!open) clearDetectedSubfolders();
  };

  const hasFolders = folders.length > 0;
  const addDisabled = !IS_ELECTRON || isScanning || isScanLocked();

  return (
    <>
      <OnboardingStepLayout
        kanji={kanji}
        headingId={headingId}
        headingRef={headingRef}
        stepMarker={t('folders.eyebrow')}
        headline={
          <Trans
            t={t}
            i18nKey="folders.headline"
            components={{ 1: <em className="not-italic text-primary" /> }}
          />
        }
        description={t('folders.description')}
      >
        <div className="space-y-3">
          <p className="text-xs font-medium text-foreground">{t('folders.title')}</p>

          {!hasFolders ? (
            <p className="rounded-xl border border-dashed border-border/30 py-6 text-center text-sm text-muted-foreground/70">
              {t('folders.empty')}
            </p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto scrollbar-thin pr-0.5">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className="group flex items-center gap-3 rounded-xl border border-border/20 bg-background/50 px-3 py-2.5"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-mono text-sm text-foreground">
                    {folder.path}
                  </span>
                  <IconButton
                    onClick={() => removeFolder(folder.id)}
                    className="opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title={t('folders.remove')}
                    aria-label={t('folders.remove')}
                  >
                    <X />
                  </IconButton>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            onClick={addFolder}
            disabled={addDisabled}
            aria-label={t('folders.addFolder')}
            className="h-auto w-full rounded-xl border-dashed border-border/40 bg-transparent py-2.5 text-primary shadow-none hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
          >
            {isScanning ? <Loader2 className="animate-spin" /> : <Plus />}
            {isScanning ? t('folders.scanning') : t('folders.addFolder')}
          </Button>

          <ScanProgressCard />

          {!IS_ELECTRON && (
            <p className="text-center text-[11px] text-muted-foreground/70">
              {t('folders.desktopOnly')}
            </p>
          )}
          {hasFolders && !isScanning && (
            <p className="text-center text-[11px] text-primary/80">{t('folders.doneHint')}</p>
          )}
        </div>
      </OnboardingStepLayout>

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
