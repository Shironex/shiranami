import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, X, Plus, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useLibraryFolders } from '@/hooks/useLibraryFolders';
import { SubfolderPlaylistDialog } from '@/components/settings/SubfolderPlaylistDialog';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { isScanLocked } from '@/lib/scanLock';

export interface WatchedFolder {
  id: string;
  path: string;
  lastScannedAt?: string;
}

export function MusicFoldersSection() {
  const { t } = useTranslation('settings');

  const { data: folders = [], isLoading: foldersLoading } = useFoldersQuery();
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

  // Open the subfolder dialog whenever the hook reports new subfolders.
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
              folders.map(folder => (
                <div
                  key={folder.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20 group"
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1 font-mono">
                    {folder.path}
                  </span>
                  <button
                    onClick={() => removeFolder(folder.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    title={t('folders.remove')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}

            <Button
              variant="outline"
              onClick={addFolder}
              disabled={isScanning || isScanLocked()}
              className="h-auto w-full rounded-xl border-dashed border-border/40 bg-transparent py-2.5 text-primary shadow-none hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            >
              {isScanning ? <Loader2 className="animate-spin" /> : <Plus />}
              {isScanning ? t('folders.scanning') : t('folders.addFolder')}
            </Button>
          </div>
        )}
      </SettingsCard>

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
