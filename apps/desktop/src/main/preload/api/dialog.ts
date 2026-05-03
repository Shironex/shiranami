import type { OpenDialogOptions } from 'electron';
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.dialog;

export interface DialogApi {
  openDirectory: () => Promise<string | null>;
  openFile: (options?: OpenDialogOptions) => Promise<string | null>;
}

export const dialogApi: DialogApi = {
  openDirectory: () => ipcRenderer.invoke(C.openDirectory),
  openFile: options => ipcRenderer.invoke(C.openFile, options),
};
