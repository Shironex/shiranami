import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../app/updater';
import { handle } from './with-ipc-handler';
import {
  updaterCheckForUpdatesArgs,
  updaterStartDownloadArgs,
  updaterInstallNowArgs,
} from './schemas/updater';

const C = IPC_CHANNELS.updater;

export function registerUpdaterHandlers(): void {
  handle(C.checkForUpdates, () => checkForUpdates(), {
    schema: updaterCheckForUpdatesArgs,
  });
  handle(C.startDownload, () => downloadUpdate(), {
    schema: updaterStartDownloadArgs,
  });
  handle(
    C.installNow,
    () => {
      quitAndInstall();
    },
    { schema: updaterInstallNowArgs }
  );
}

export function cleanupUpdaterHandlers(): void {
  ipcMain.removeHandler(C.checkForUpdates);
  ipcMain.removeHandler(C.startDownload);
  ipcMain.removeHandler(C.installNow);
}
