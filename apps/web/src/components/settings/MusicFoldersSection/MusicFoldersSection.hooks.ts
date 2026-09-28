import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import {
  folderWatchedPatch,
  useFolderWatchPrefsQuery,
  watchFoldersPatch,
} from '@/hooks/queries/useFolderWatchPrefs';
import { useUpdateSettingsMutation } from '@/hooks/queries/useSettings';
import { useLibraryFolders } from '@/hooks/useLibraryFolders';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { IS_ELECTRON } from '@/lib/platform';
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

  // Read by the shell's watcher (see `useFolderWatchPrefs`). Inert until the
  // settings blob has seeded, so the switch never shows a state the shell has
  // not agreed to.
  const { data: watchPrefs } = useFolderWatchPrefsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const excluded = watchPrefs?.excluded ?? [];

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
    folders: folders.map(folder => ({
      id: folder.id,
      path: folder.path,
      watched: !excluded.includes(folder.id),
    })),
    isScanning,
    isAddDisabled: isScanning || isScanLocked(),
    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onAddFolder: addFolder,
    onRemoveFolder: removeFolder,
    watchEnabled: watchPrefs?.enabled ?? true,
    watchDisabled: !IS_ELECTRON || watchPrefs === undefined,
    onSetWatchEnabled: enabled => updateSettings.mutate(watchFoldersPatch(enabled)),
    onSetFolderWatched: (id, watched) =>
      updateSettings.mutate(folderWatchedPatch(excluded, id, watched)),
    onDialogOpenChange,
    onSubfolderConfirm,
  };
}
