import { app, ipcMain, shell } from 'electron';
import { getLogsDir } from '../logger';

export function registerAppHandlers(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:open-logs-folder', async () => {
    await shell.openPath(getLogsDir());
  });
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:open-logs-folder');
}
