import { ShareDialog } from '@/components/shared/ShareDialog';
import { ImportDialog } from '@/components/shared/ImportDialog';
import { useShareDialogManager } from './ShareDialogManager.hooks';

export default function ShareDialogManager() {
  const { shareOpen, setShareOpen, shareRequest, importCode, importOpen, setImportOpen } =
    useShareDialogManager();

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
