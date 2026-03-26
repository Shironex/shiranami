import { useState, useEffect } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { ShareDialog } from './ShareDialog';
import { ImportDialog } from './ImportDialog';

interface ShareRequest {
  type: 'track' | 'playlist';
  id: string;
}

export default function ShareDialogManager() {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState('');

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

  // Listen for deep link imports from Electron main process
  useEffect(() => {
    if (!IS_ELECTRON) return;
    return window.electronAPI.share.onDeepLink((code) => {
      setImportCode(code);
      setImportOpen(true);
    });
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
