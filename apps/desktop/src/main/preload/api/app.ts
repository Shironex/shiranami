import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.app;

export interface AppApi {
  getVersion: () => Promise<string>;
  openLogsFolder: () => Promise<void>;
  getLocaleCountry: () => Promise<string>;
}

export const appApi: AppApi = {
  getVersion: () => invoke(C.getVersion),
  openLogsFolder: () => invoke(C.openLogsFolder),
  getLocaleCountry: () => invoke(C.getLocaleCountry),
};
