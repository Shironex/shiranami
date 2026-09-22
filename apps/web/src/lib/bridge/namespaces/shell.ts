import type { ShellApi } from '@shiranami/contracts';
import { commands } from '../commands';

export const shellApi: ShellApi = {
  showInFolder: async filePath => {
    await commands.shellShowInFolder(filePath);
  },
  trashFile: async filePath => {
    await commands.shellTrashFile(filePath);
  },
};
