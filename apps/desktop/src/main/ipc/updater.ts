import { ipcMain } from 'electron';
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../updater';
import { handle } from './with-ipc-handler';
import {
  updaterCheckForUpdatesArgs,
  updaterStartDownloadArgs,
  updaterInstallNowArgs,
} from './schemas/updater';

export function registerUpdaterHandlers(): void {
  handle('updater:check-for-updates', () => checkForUpdates(), {
    schema: updaterCheckForUpdatesArgs,
  });
  handle('updater:start-download', () => downloadUpdate(), {
    schema: updaterStartDownloadArgs,
  });
  handle(
    'updater:install-now',
    () => {
      quitAndInstall();
    },
    { schema: updaterInstallNowArgs },
  );
}

export function cleanupUpdaterHandlers(): void {
  ipcMain.removeHandler('updater:check-for-updates');
  ipcMain.removeHandler('updater:start-download');
  ipcMain.removeHandler('updater:install-now');
}
