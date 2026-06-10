import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.shell;

export interface ShellApi {
  showInFolder: (filePath: string) => Promise<void>;
  trashFile: (filePath: string) => Promise<void>;
}

export const shellApi: ShellApi = {
  showInFolder: filePath => invoke(C.showInFolder, filePath),
  trashFile: filePath => invoke(C.trashFile, filePath),
};
