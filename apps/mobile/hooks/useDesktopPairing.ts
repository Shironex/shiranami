import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { parsePairingLink } from '@shiranami/contracts/sync';
import { asSyncError, SyncError, type SyncErrorCode } from '@/lib/sync-client';
import { secureSecrets, syncFetch } from '@/lib/sync-files';
import { pairWithDesktop } from '@/lib/sync-pairing';
import { savePeer } from '@/lib/sync-peer';
import { useSyncStore } from '@/stores/useSyncStore';

export type PairingScreenState =
  | { kind: 'scanning'; wrongCode: boolean }
  | { kind: 'connecting'; desktopName: string }
  | { kind: 'waiting'; desktopName: string; host: string }
  | { kind: 'failed'; desktopName: string; error: SyncErrorCode }
  | { kind: 'paired'; desktopName: string };

/** What the desktop's Allow / Deny prompt calls this phone. */
function deviceName(): string {
  const constants = Platform.constants as { Model?: string; Manufacturer?: string };
  return constants.Model ?? 'Android phone';
}

/**
 * The pairing screen's state: scan, find the desktop, wait for Allow, then
 * save the secret to the keystore and the desktop to settings. Leaving the
 * screen cancels a pairing in progress.
 */
export function useDesktopPairing() {
  const db = useSQLiteContext();
  const [state, setState] = useState<PairingScreenState>({ kind: 'scanning', wrongCode: false });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const onScan = useCallback(
    async (data: string) => {
      if (controller.current) return;
      const link = parsePairingLink(data.trim());
      if (!link) {
        // The camera reports the same code every frame; re-render only once.
        setState(prev =>
          prev.kind === 'scanning' && prev.wrongCode ? prev : { kind: 'scanning', wrongCode: true }
        );
        return;
      }
      const attempt = new AbortController();
      controller.current = attempt;
      const desktopName = link.desktopName || 'your desktop';
      setState({ kind: 'connecting', desktopName });
      try {
        const { peer, secret } = await pairWithDesktop(link, {
          fetch: syncFetch,
          deviceName: deviceName(),
          platform: 'android',
          signal: attempt.signal,
          onPhase: phase => {
            if (phase.kind === 'waiting') {
              setState({ kind: 'waiting', desktopName: phase.desktopName, host: phase.host });
            }
          },
        });
        try {
          await savePeer(db, secureSecrets, peer, secret);
        } catch {
          throw new SyncError('storage');
        }
        useSyncStore.getState().setPeer(peer);
        setState({ kind: 'paired', desktopName: peer.desktopName });
      } catch (e) {
        const error = asSyncError(e, attempt.signal);
        if (error.code !== 'cancelled')
          setState({ kind: 'failed', desktopName, error: error.code });
      } finally {
        if (controller.current === attempt) controller.current = null;
      }
    },
    [db]
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ kind: 'scanning', wrongCode: false });
  }, []);

  const retry = useCallback(() => setState({ kind: 'scanning', wrongCode: false }), []);

  return { state, onScan, cancel, retry };
}
