import { IPC_CHANNELS, type SystemApi, type SystemNotice } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { subscribeChannel } from '../events';
import { systemNotice } from '../narrowers';

const C = IPC_CHANNELS.system;

export const systemApi: SystemApi = {
  onNotice: callback =>
    subscribeChannel<SystemNotice>(C.notice, events.systemNotice, systemNotice, callback),
};
