import { ipcMain } from 'electron';
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../updater';
import { handle } from './with-ipc-handler';

export function registerUpdaterHandlers(): void {
  handle('updater:check-for-updates', () => checkForUpdates());
  handle('updater:start-download', () => downloadUpdate());
  handle('updater:install-now', () => {
    quitAndInstall();
  });
}

export function cleanupUpdaterHandlers(): void {
  ipcMain.removeHandler('updater:check-for-updates');
  ipcMain.removeHandler('updater:start-download');
  ipcMain.removeHandler('updater:install-now');
}
