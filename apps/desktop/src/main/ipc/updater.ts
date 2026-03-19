import { ipcMain } from 'electron';
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../updater';
import { logger } from '../logger';

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check-for-updates', async () => {
    try {
      return await checkForUpdates();
    } catch (error) {
      logger.error('[ipc:updater] Failed to check for updates:', error);
      throw error;
    }
  });

  ipcMain.handle('updater:start-download', async () => {
    try {
      await downloadUpdate();
    } catch (error) {
      logger.error('[ipc:updater] Failed to start download:', error);
      throw error;
    }
  });

  ipcMain.handle('updater:install-now', async () => {
    try {
      quitAndInstall();
    } catch (error) {
      logger.error('[ipc:updater] Failed to quit and install:', error);
      throw error;
    }
  });
}

export function cleanupUpdaterHandlers(): void {
  ipcMain.removeHandler('updater:check-for-updates');
  ipcMain.removeHandler('updater:start-download');
  ipcMain.removeHandler('updater:install-now');
}
