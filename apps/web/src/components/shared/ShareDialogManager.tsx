import { useEffect, useState } from 'react';
import { ShareDialog } from './ShareDialog';
import { ImportDialog } from './ImportDialog';
import { useShareDeepLink } from '@/hooks/useShareDeepLink';

interface ShareRequest {
  type: 'track' | 'playlist';
  id: string;
}

export default function ShareDialogManager() {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);

  const { importCode, importOpen, setImportOpen } = useShareDeepLink();

  // Listen for share dialog open events (from context menu / playlist header)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ShareRequest>).detail;
      setShareRequest(detail);
      setShareOpen(true);
    };
    window.addEventListener('open-share-dialog', handler);
    return () => window.removeEventListener('open-share-dialog', handler);
  }, []);

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
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          code={importCode}
        />
      )}
    </>
  );
}
