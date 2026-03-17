import { BrowserWindow, dialog, ipcMain } from 'electron';

export function registerDialogHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
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
    }
  );
}

export function cleanupDialogHandlers(): void {
  ipcMain.removeHandler('dialog:open-directory');
  ipcMain.removeHandler('dialog:open-file');
}
