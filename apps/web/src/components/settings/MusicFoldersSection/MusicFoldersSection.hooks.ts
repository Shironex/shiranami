import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useLibraryFolders } from '@/hooks/useLibraryFolders';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { isScanLocked } from '@/lib/scanLock';
import type { IMusicFoldersSectionView } from './MusicFoldersSection.types';

export function useMusicFoldersSection(): IMusicFoldersSectionView {
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

  const onSubfolderConfirm = useSubfolderPlaylistConfirm();

  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);

  // Open the subfolder dialog whenever the hook reports new subfolders.
  useEffect(() => {
    if (detectedSubfolders.length > 0) {
      setSubfolderDialogOpen(true);
    }
  }, [detectedSubfolders]);

  const onDialogOpenChange = (open: boolean): void => {
    setSubfolderDialogOpen(open);
    if (!open) clearDetectedSubfolders();
  };

  return {
    t,
    foldersLoading,
    folders: folders.map(folder => ({ id: folder.id, path: folder.path })),
    isScanning,
    isAddDisabled: isScanning || isScanLocked(),
    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onAddFolder: addFolder,
    onRemoveFolder: removeFolder,
    onDialogOpenChange,
    onSubfolderConfirm,
  };
}
