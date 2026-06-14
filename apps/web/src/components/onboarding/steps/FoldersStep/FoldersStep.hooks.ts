import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { isScanLocked } from '@/lib/scanLock';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useLibraryFolders } from '@/hooks/useLibraryFolders';
import { useSubfolderPlaylistConfirm } from '@/hooks/useSubfolderPlaylistConfirm';
import { useOnboardingStepContext } from '../../stepContext';
import type { IFoldersStepView } from './FoldersStep.types';

export function useFoldersStep(): IFoldersStepView {
  const { t } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();

  const { data: folders = [] } = useFoldersQuery();
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

  useEffect(() => {
    if (detectedSubfolders.length > 0) setSubfolderDialogOpen(true);
  }, [detectedSubfolders]);

  const onSubfolderDialogOpenChange = (open: boolean) => {
    setSubfolderDialogOpen(open);
    if (!open) clearDetectedSubfolders();
  };

  const hasFolders = folders.length > 0;
  const addDisabled = !IS_ELECTRON || isScanning || isScanLocked();

  return {
    t,
    stepContext,
    folders,
    hasFolders,
    isScanning,
    addDisabled,
    showDesktopNotice: !IS_ELECTRON,
    showDoneHint: hasFolders && !isScanning,
    subfolderDialogOpen,
    detectedSubfolders,
    existingPlaylistNames,
    onAddFolder: addFolder,
    onRemoveFolder: removeFolder,
    onSubfolderDialogOpenChange,
    onSubfolderConfirm,
  };
}
