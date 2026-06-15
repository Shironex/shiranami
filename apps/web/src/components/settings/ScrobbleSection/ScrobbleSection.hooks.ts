import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import type { ScrobbleStatus } from '@shiranami/contracts';
import type { IScrobbleSectionView, ScrobbleBusy } from './ScrobbleSection.types';

const EMPTY_STATUS: ScrobbleStatus = {
  enabled: false,
  lastfmConnected: false,
  lastfmUsername: null,
  listenBrainzConnected: false,
  pendingCount: 0,
};

export function useScrobbleSection(): IScrobbleSectionView {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<ScrobbleStatus>(EMPTY_STATUS);
  const [lbToken, setLbToken] = useState('');
  const [busy, setBusy] = useState<ScrobbleBusy>(null);
  // Last.fm desktop auth is a two-step handshake: step 1 opens the browser and
  // mints a token; the user approves there; step 2 exchanges the (now
  // authorized) token for a session key. We hold the pending token between the
  // two clicks — exchanging immediately would always fail (token not yet
  // authorized).
  const [lastfmPendingToken, setLastfmPendingToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.getStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggle = useCallback(async (enabled: boolean) => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.setEnabled(enabled));
  }, []);

  // Step 1: open the Last.fm auth page and remember the request token. The user
  // approves access in their browser, then comes back and clicks "Finish".
  const onBeginLastfm = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setBusy('lastfm');
    try {
      const begun = await window.electronAPI.scrobble.lastfmBeginAuth();
      if (!begun.ok || !begun.token) {
        toast.error(t('scrobbleSettings.lastfmAuthFailed'));
        return;
      }
      setLastfmPendingToken(begun.token);
      toast.info(t('scrobbleSettings.lastfmApprovePrompt'));
    } finally {
      setBusy(null);
    }
  }, [t]);

  // Step 2: exchange the (now-approved) token for a session key.
  const onFinishLastfm = useCallback(async () => {
    if (!IS_ELECTRON || !lastfmPendingToken) return;
    setBusy('lastfm');
    try {
      const result = await window.electronAPI.scrobble.lastfmCompleteAuth(lastfmPendingToken);
      if (result.ok) {
        toast.success(t('scrobbleSettings.lastfmConnected', { name: result.username ?? '' }));
        setLastfmPendingToken(null);
        await refresh();
      } else {
        toast.error(t('scrobbleSettings.lastfmAuthFailed'));
      }
    } finally {
      setBusy(null);
    }
  }, [lastfmPendingToken, refresh, t]);

  const onCancelLastfm = useCallback(() => setLastfmPendingToken(null), []);

  const onDisconnectLastfm = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.lastfmDisconnect());
  }, []);

  const onConnectListenBrainz = useCallback(async () => {
    if (!IS_ELECTRON) return;
    const token = lbToken.trim();
    if (!token) return;
    setBusy('listenbrainz');
    try {
      const result = await window.electronAPI.scrobble.listenBrainzConnect(token);
      if (result.ok) {
        toast.success(t('scrobbleSettings.listenBrainzConnected', { name: result.username ?? '' }));
        setLbToken('');
        await refresh();
      } else {
        toast.error(t('scrobbleSettings.listenBrainzInvalid'));
      }
    } finally {
      setBusy(null);
    }
  }, [lbToken, refresh, t]);

  const onDisconnectListenBrainz = useCallback(async () => {
    if (!IS_ELECTRON) return;
    setStatus(await window.electronAPI.scrobble.listenBrainzDisconnect());
  }, []);

  return {
    t,
    status,
    lbToken,
    busy,
    lastfmPendingToken,
    showLastfmUsername: status.lastfmConnected && status.lastfmUsername !== null,
    onLbTokenChange: setLbToken,
    onToggle: enabled => void onToggle(enabled),
    onBeginLastfm: () => void onBeginLastfm(),
    onFinishLastfm: () => void onFinishLastfm(),
    onCancelLastfm,
    onDisconnectLastfm: () => void onDisconnectLastfm(),
    onConnectListenBrainz: () => void onConnectListenBrainz(),
    onDisconnectListenBrainz: () => void onDisconnectListenBrainz(),
  };
}
