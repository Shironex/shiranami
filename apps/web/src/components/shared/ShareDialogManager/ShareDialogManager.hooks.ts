import { useShareDeepLink } from '@/hooks/useShareDeepLink';
import { useDialogEventBridge } from '@/hooks/useDialogEventBridge';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import type { IShareDialogManagerView, IShareRequest } from './ShareDialogManager.types';

export function useShareDialogManager(): IShareDialogManagerView {
  // Listen for share dialog open events (from context menu / playlist header).
  const {
    open: shareOpen,
    setOpen: setShareOpen,
    request: shareRequest,
  } = useDialogEventBridge<IShareRequest>(DIALOG_EVENTS.openShare);

  const { importCode, importOpen, setImportOpen } = useShareDeepLink();

  return {
    shareOpen,
    setShareOpen,
    shareRequest,
    importCode,
    importOpen,
    setImportOpen,
  };
}
