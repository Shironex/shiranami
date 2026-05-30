import { ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type ScrobbleStatus,
  type LastfmConnectResult,
  type ListenBrainzConnectResult,
} from '@shiranami/contracts';

const C = IPC_CHANNELS.scrobble;

export interface ScrobbleApi {
  /** Read the connection status (booleans + display name only; never secrets). */
  getStatus: () => Promise<ScrobbleStatus>;
  /** Toggle the master opt-in switch. */
  setEnabled: (enabled: boolean) => Promise<ScrobbleStatus>;
  /** Open the Last.fm auth page; returns the request token to complete with. */
  lastfmBeginAuth: () => Promise<{ ok: boolean; token?: string; error?: string }>;
  /** Exchange the approved Last.fm token for a stored session key. */
  lastfmCompleteAuth: (token: string) => Promise<LastfmConnectResult>;
  /** Disconnect Last.fm (forget the session key). */
  lastfmDisconnect: () => Promise<ScrobbleStatus>;
  /** Validate + store a ListenBrainz user token. */
  listenBrainzConnect: (token: string) => Promise<ListenBrainzConnectResult>;
  /** Disconnect ListenBrainz (forget the token). */
  listenBrainzDisconnect: () => Promise<ScrobbleStatus>;
}

export const scrobbleApi: ScrobbleApi = {
  getStatus: () => ipcRenderer.invoke(C.getStatus),
  setEnabled: enabled => ipcRenderer.invoke(C.setEnabled, enabled),
  lastfmBeginAuth: () => ipcRenderer.invoke(C.lastfmBeginAuth),
  lastfmCompleteAuth: token => ipcRenderer.invoke(C.lastfmCompleteAuth, token),
  lastfmDisconnect: () => ipcRenderer.invoke(C.lastfmDisconnect),
  listenBrainzConnect: token => ipcRenderer.invoke(C.listenBrainzConnect, token),
  listenBrainzDisconnect: () => ipcRenderer.invoke(C.listenBrainzDisconnect),
};
