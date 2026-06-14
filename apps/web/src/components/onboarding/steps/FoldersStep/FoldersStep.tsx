import { Trans } from 'react-i18next';
import { FolderOpen, Plus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ScanProgressCard } from '@/components/library/ScanProgressCard';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { useFoldersStep } from './FoldersStep.hooks';

export default function FoldersStep() {
  const {
    t,
    stepContext,
    folders,
    hasFolders,
    isScanning,
    addDisabled,
    showDesktopNotice,
    showDoneHint,
    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onAddFolder,
    onRemoveFolder,
    onSubfolderDialogOpenChange,
    onSubfolderConfirm,
  } = useFoldersStep();

  const folderRows = folders.map(folder => (
    <div
      key={folder.id}
      className="group flex items-center gap-3 rounded-xl border border-border/20 bg-background/50 px-3 py-2.5"
    >
      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate font-mono text-sm text-foreground">{folder.path}</span>
      <IconButton
        onClick={() => onRemoveFolder(folder.id)}
        className="opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title={t('folders.remove')}
        aria-label={t('folders.remove')}
      >
        <X />
      </IconButton>
    </div>
  ));

  return (
    <>
      <OnboardingStepLayout
        kanji={stepContext.kanji}
        headingId={stepContext.headingId}
        headingRef={stepContext.headingRef}
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
              {folderRows}
            </div>
          )}

          <Button
            variant="outline"
            onClick={onAddFolder}
            disabled={addDisabled}
            aria-label={t('folders.addFolder')}
            className="h-auto w-full rounded-xl border-dashed border-border/40 bg-transparent py-2.5 text-primary shadow-none hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
          >
            {isScanning ? <Loader2 className="animate-spin" /> : <Plus />}
            {isScanning ? t('folders.scanning') : t('folders.addFolder')}
          </Button>

          <ScanProgressCard />

          {showDesktopNotice && (
            <p className="text-center text-[11px] text-muted-foreground/70">
              {t('folders.desktopOnly')}
            </p>
          )}
          {showDoneHint && (
            <p className="text-center text-[11px] text-primary/80">{t('folders.doneHint')}</p>
          )}
        </div>
      </OnboardingStepLayout>

      <SubfolderPlaylistDialog
        open={subfolderDialogOpen}
        onOpenChange={onSubfolderDialogOpenChange}
        subfolders={detectedSubfolders}
        onConfirm={onSubfolderConfirm}
        existingPlaylistNames={existingPlaylistNames}
      />
    </>
  );
}
