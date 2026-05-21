import { ShareDialog } from './ShareDialog';
import { ImportDialog } from './ImportDialog';
import { useShareDeepLink } from '@/hooks/useShareDeepLink';
import { useDialogEventBridge } from '@/hooks/useDialogEventBridge';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';

interface ShareRequest {
  type: 'track' | 'playlist';
  id: string;
}

export default function ShareDialogManager() {
  // Listen for share dialog open events (from context menu / playlist header)
  const {
    open: shareOpen,
    setOpen: setShareOpen,
    request: shareRequest,
  } = useDialogEventBridge<ShareRequest>(DIALOG_EVENTS.openShare);

  const { importCode, importOpen, setImportOpen } = useShareDeepLink();

  return (
    <>
      {shareRequest && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          type={shareRequest.type}
          id={shareRequest.id}
        />
      )}
      {importCode && (
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} code={importCode} />
      )}
    </>
  );
}
