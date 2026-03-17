import { app, ipcMain } from 'electron';

export function registerAppHandlers(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler('app:get-version');
}
