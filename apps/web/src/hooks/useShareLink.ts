import { useCallback, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';

export type ShareLinkState = 'idle' | 'loading' | 'success' | 'error';

export interface UseShareLinkResult {
  state: ShareLinkState;
  shareUrl: string;
  expiresAt: Date | null;
  error: string;
  shareTrack: (trackId: string) => Promise<void>;
  sharePlaylist: (playlistId: string) => Promise<void>;
  reset: () => void;
}

/**
 * Encapsulates the share-link state machine used by ShareDialog.
 * Mirrors the original inline logic, including cancellation via state reset.
 */
export function useShareLink(): UseShareLinkResult {
  const [state, setState] = useState<ShareLinkState>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const run = useCallback(
    async (
      fn: () => Promise<{ code: string; url: string; expiresAt: string }>,
    ) => {
      if (!IS_ELECTRON) return;
      setState('loading');
      setError('');
      try {
        const result = await fn();
        setShareUrl(result.url);
        setExpiresAt(new Date(result.expiresAt));
        setState('success');
      } catch (err) {
        setError((err as Error).message ?? '');
        setState('error');
      }
    },
    [],
  );

  const shareTrack = useCallback(
    (trackId: string) => run(() => window.electronAPI.share.track(trackId)),
    [run],
  );

  const sharePlaylist = useCallback(
    (playlistId: string) =>
      run(() => window.electronAPI.share.playlist(playlistId)),
    [run],
  );

  const reset = useCallback(() => {
    setState('idle');
    setShareUrl('');
    setExpiresAt(null);
    setError('');
  }, []);

  return { state, shareUrl, expiresAt, error, shareTrack, sharePlaylist, reset };
}
