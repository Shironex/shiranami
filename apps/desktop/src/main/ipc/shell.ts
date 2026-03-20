import { ipcMain, shell } from 'electron';

export function registerShellHandlers(): void {
  ipcMain.handle('shell:show-in-folder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('shell:trash-file', async (_event, filePath: string) => {
    await shell.trashItem(filePath);
  });
}

export function cleanupShellHandlers(): void {
  ipcMain.removeHandler('shell:show-in-folder');
  ipcMain.removeHandler('shell:trash-file');
}
