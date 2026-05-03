import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.shell;

export interface ShellApi {
  showInFolder: (filePath: string) => Promise<void>;
  trashFile: (filePath: string) => Promise<void>;
}

export const shellApi: ShellApi = {
  showInFolder: filePath => ipcRenderer.invoke(C.showInFolder, filePath),
  trashFile: filePath => ipcRenderer.invoke(C.trashFile, filePath),
};
