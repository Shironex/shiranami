import type { OpenDialogOptions } from 'electron';
import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.dialog;

export interface DialogApi {
  openDirectory: () => Promise<string | null>;
  openFile: (options?: OpenDialogOptions) => Promise<string | null>;
}

export const dialogApi: DialogApi = {
  openDirectory: () => invoke(C.openDirectory),
  openFile: options => invoke(C.openFile, options),
};
