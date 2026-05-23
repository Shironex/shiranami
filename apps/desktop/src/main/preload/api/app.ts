import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.app;

export interface AppApi {
  getVersion: () => Promise<string>;
  openLogsFolder: () => Promise<void>;
  getLocaleCountry: () => Promise<string>;
}

export const appApi: AppApi = {
  getVersion: () => ipcRenderer.invoke(C.getVersion),
  openLogsFolder: () => ipcRenderer.invoke(C.openLogsFolder),
  getLocaleCountry: () => ipcRenderer.invoke(C.getLocaleCountry),
};
