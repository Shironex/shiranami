import { ipcMain, shell } from 'electron';
import { handle } from './with-ipc-handler';
import { showInFolderArgs, trashFileArgs } from './schemas/shell';

export function registerShellHandlers(): void {
  handle(
    'shell:show-in-folder',
    (_event, filePath: string) => {
      shell.showItemInFolder(filePath);
    },
    { schema: showInFolderArgs },
  );

  handle(
    'shell:trash-file',
    async (_event, filePath: string) => {
      await shell.trashItem(filePath);
    },
    { schema: trashFileArgs },
  );
}

export function cleanupShellHandlers(): void {
  ipcMain.removeHandler('shell:show-in-folder');
  ipcMain.removeHandler('shell:trash-file');
}
