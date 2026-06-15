import { FolderOpen, X, Plus, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { ScanProgressCard } from '@/components/library/ScanProgressCard';
import { useMusicFoldersSection } from './MusicFoldersSection.hooks';
import type { IMusicFolderRow } from './MusicFoldersSection.types';

export default function MusicFoldersSection() {
  const {
    t,
    foldersLoading,
    folders,
    isScanning,
    isAddDisabled,
    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onAddFolder,
    onRemoveFolder,
    onDialogOpenChange,
    onSubfolderConfirm,
  } = useMusicFoldersSection();

  const folderRows = folders.map((folder: IMusicFolderRow) => (
    <div
      key={folder.id}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20 group"
    >
      <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-foreground truncate flex-1 font-mono">{folder.path}</span>
      <IconButton
        onClick={() => onRemoveFolder(folder.id)}
        className="opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive"
        title={t('folders.remove')}
        aria-label={t('folders.remove')}
      >
        <X />
      </IconButton>
    </div>
  ));

  return (
    <>
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
              folderRows
            )}

            <Button
              variant="outline"
              onClick={onAddFolder}
              disabled={isAddDisabled}
              className="h-auto w-full rounded-xl border-dashed border-border/40 bg-transparent py-2.5 text-primary shadow-none hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            >
              {isScanning ? <Loader2 className="animate-spin" /> : <Plus />}
              {isScanning ? t('folders.scanning') : t('folders.addFolder')}
            </Button>

            <ScanProgressCard />
          </div>
        )}
      </SettingsCard>

      <SubfolderPlaylistDialog
        open={subfolderDialogOpen}
        onOpenChange={onDialogOpenChange}
        subfolders={detectedSubfolders}
        onConfirm={onSubfolderConfirm}
        existingPlaylistNames={existingPlaylistNames}
      />
    </>
  );
}
