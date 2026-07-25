import { IPC_CHANNELS, type SystemApi } from '@shiranami/contracts';
import type { SystemNotice } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.system;

export type { SystemApi };

export const systemApi: SystemApi = {
  onNotice: createIpcListener<SystemNotice>(C.notice),
};
