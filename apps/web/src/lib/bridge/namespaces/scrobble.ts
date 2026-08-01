import type {
  LastfmConnectResult,
  ListenBrainzConnectResult,
  ScrobbleApi,
} from '@shiranami/contracts';
import { commands } from '../commands';
import { asContract } from '../wire';

export const scrobbleApi: ScrobbleApi = {
  getStatus: () => commands.scrobbleGetStatus(),
  setEnabled: enabled => commands.scrobbleSetEnabled(enabled),
  lastfmBeginAuth: () =>
    asContract<{ ok: boolean; token?: string; error?: string }>(commands.scrobbleLastfmBeginAuth()),
  lastfmCompleteAuth: token =>
    asContract<LastfmConnectResult>(commands.scrobbleLastfmCompleteAuth(token)),
  lastfmDisconnect: () => commands.scrobbleLastfmDisconnect(),
  listenBrainzConnect: token =>
    asContract<ListenBrainzConnectResult>(commands.scrobbleListenbrainzConnect(token)),
  listenBrainzDisconnect: () => commands.scrobbleListenbrainzDisconnect(),
};
