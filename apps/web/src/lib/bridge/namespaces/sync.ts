import { IPC_CHANNELS, type SyncApi } from '@shiranami/contracts';
import { events, type SyncStatus } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { syncStatus } from '../narrowers';

const C = IPC_CHANNELS.sync;

export const syncApi: SyncApi = {
  getStatus: () => commands.syncGetStatus(),
  setEnabled: enabled => commands.syncSetEnabled(enabled),
  startPairing: () => commands.syncStartPairing(),
  cancelPairing: () => commands.syncCancelPairing(),
  respondPairing: (requestId, allow) => commands.syncRespondPairing(requestId, allow),
  listDevices: () => commands.syncListDevices(),
  revokeDevice: deviceId => commands.syncRevokeDevice(deviceId),
  onStatus: callback =>
    subscribeChannel<SyncStatus>(C.status, events.syncStatus, syncStatus, callback),
};
