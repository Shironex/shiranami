import { BrowserWindow, dialog, ipcMain } from 'electron';
import { handle } from './with-ipc-handler';
import { dialogOpenDirectoryArgs, dialogOpenFileArgs } from './schemas/dialog';

export function registerDialogHandlers(mainWindow: BrowserWindow): void {
  handle(
    'dialog:open-directory',
    async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    },
    { schema: dialogOpenDirectoryArgs },
  );

  handle(
    'dialog:open-file',
    async (_event, options?: { filters?: Electron.FileFilter[] }) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options?.filters ?? [
          {
            name: 'Audio Files',
            extensions: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'opus', 'wma'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      return result.canceled ? null : result.filePaths[0];
    },
    { schema: dialogOpenFileArgs },
  );
}

export function cleanupDialogHandlers(): void {
  ipcMain.removeHandler('dialog:open-directory');
  ipcMain.removeHandler('dialog:open-file');
}
