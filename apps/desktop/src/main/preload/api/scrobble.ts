import { invoke } from '../context-bridge';
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
  getStatus: () => invoke(C.getStatus),
  setEnabled: enabled => invoke(C.setEnabled, enabled),
  lastfmBeginAuth: () => invoke(C.lastfmBeginAuth),
  lastfmCompleteAuth: token => invoke(C.lastfmCompleteAuth, token),
  lastfmDisconnect: () => invoke(C.lastfmDisconnect),
  listenBrainzConnect: token => invoke(C.listenBrainzConnect, token),
  listenBrainzDisconnect: () => invoke(C.listenBrainzDisconnect),
};
