import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type ScrobbleStatus,
  type LastfmConnectResult,
  type ListenBrainzConnectResult,
} from '@shiranami/contracts';
import {
  getScrobbleStatus,
  setScrobbleEnabled,
  beginLastfmAuth,
  completeLastfmAuth,
  disconnectLastfm,
  connectListenBrainz,
  disconnectListenBrainz,
} from '../scrobble/scrobbler';
import { handle } from './with-ipc-handler';
import {
  scrobbleGetStatusArgs,
  scrobbleSetEnabledArgs,
  scrobbleLastfmBeginAuthArgs,
  scrobbleLastfmCompleteAuthArgs,
  scrobbleLastfmDisconnectArgs,
  scrobbleListenBrainzConnectArgs,
  scrobbleListenBrainzDisconnectArgs,
} from './schemas/scrobble';

const C = IPC_CHANNELS.scrobble;

/**
 * Scrobbling IPC handlers. The renderer Settings UI reads the connection status
 * and writes credentials in — but the raw session key / token are never
 * returned, only the {@link ScrobbleStatus} booleans + display name.
 */
export function registerScrobbleHandlers(): void {
  handle(C.getStatus, async (): Promise<ScrobbleStatus> => getScrobbleStatus(), {
    schema: scrobbleGetStatusArgs,
  });

  handle(
    C.setEnabled,
    async (_event, enabled: boolean): Promise<ScrobbleStatus> => setScrobbleEnabled(enabled),
    { schema: scrobbleSetEnabledArgs }
  );

  handle(
    C.lastfmBeginAuth,
    async (): Promise<{ ok: boolean; token?: string; error?: string }> => beginLastfmAuth(),
    { schema: scrobbleLastfmBeginAuthArgs }
  );

  handle(
    C.lastfmCompleteAuth,
    async (_event, token: string): Promise<LastfmConnectResult> => completeLastfmAuth(token),
    { schema: scrobbleLastfmCompleteAuthArgs }
  );

  handle(C.lastfmDisconnect, async (): Promise<ScrobbleStatus> => disconnectLastfm(), {
    schema: scrobbleLastfmDisconnectArgs,
  });

  handle(
    C.listenBrainzConnect,
    async (_event, token: string): Promise<ListenBrainzConnectResult> => connectListenBrainz(token),
    { schema: scrobbleListenBrainzConnectArgs }
  );

  handle(C.listenBrainzDisconnect, async (): Promise<ScrobbleStatus> => disconnectListenBrainz(), {
    schema: scrobbleListenBrainzDisconnectArgs,
  });
}

export function cleanupScrobbleHandlers(): void {
  ipcMain.removeHandler(C.getStatus);
  ipcMain.removeHandler(C.setEnabled);
  ipcMain.removeHandler(C.lastfmBeginAuth);
  ipcMain.removeHandler(C.lastfmCompleteAuth);
  ipcMain.removeHandler(C.lastfmDisconnect);
  ipcMain.removeHandler(C.listenBrainzConnect);
  ipcMain.removeHandler(C.listenBrainzDisconnect);
}
