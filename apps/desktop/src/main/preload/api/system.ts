import { IPC_CHANNELS } from '@shiranami/contracts';
import type { SystemNotice } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.system;

export interface SystemApi {
  onNotice: (callback: (notice: SystemNotice) => void) => () => void;
}

export const systemApi: SystemApi = {
  onNotice: createIpcListener<SystemNotice>(C.notice),
};
