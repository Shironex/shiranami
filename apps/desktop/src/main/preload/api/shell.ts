import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type ShellApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.shell;

export type { ShellApi };

export const shellApi: ShellApi = {
  showInFolder: filePath => invoke(C.showInFolder, filePath),
  trashFile: filePath => invoke(C.trashFile, filePath),
};
