import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type AppApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.app;

export type { AppApi };

export const appApi: AppApi = {
  getVersion: () => invoke(C.getVersion),
  openLogsFolder: () => invoke(C.openLogsFolder),
  getLocaleCountry: () => invoke(C.getLocaleCountry),
};
