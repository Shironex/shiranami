import { ipcMain, shell } from 'electron';

export function registerShellHandlers(): void {
  ipcMain.handle('shell:show-in-folder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

export function cleanupShellHandlers(): void {
  ipcMain.removeHandler('shell:show-in-folder');
}
