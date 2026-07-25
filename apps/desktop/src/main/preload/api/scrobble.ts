import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type ScrobbleApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.scrobble;

export type { ScrobbleApi };

export const scrobbleApi: ScrobbleApi = {
  getStatus: () => invoke(C.getStatus),
  setEnabled: enabled => invoke(C.setEnabled, enabled),
  lastfmBeginAuth: () => invoke(C.lastfmBeginAuth),
  lastfmCompleteAuth: token => invoke(C.lastfmCompleteAuth, token),
  lastfmDisconnect: () => invoke(C.lastfmDisconnect),
  listenBrainzConnect: token => invoke(C.listenBrainzConnect, token),
  listenBrainzDisconnect: () => invoke(C.listenBrainzDisconnect),
};
