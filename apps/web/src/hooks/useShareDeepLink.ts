import { useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';

export interface UseShareDeepLinkResult {
  importCode: string;
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
}

/**
 * Subscribes to the `share.onDeepLink` stream and exposes a controlled
 * import-dialog open state that flips true when a deep link arrives.
 */
export function useShareDeepLink(): UseShareDeepLinkResult {
  const [importCode, setImportCode] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    return window.electronAPI.share.onDeepLink(code => {
      setImportCode(code);
      setImportOpen(true);
    });
  }, []);

  return { importCode, importOpen, setImportOpen };
}
