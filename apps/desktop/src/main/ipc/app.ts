import { app, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { getLogsDir } from '../logger';
import { handle } from './with-ipc-handler';
import { appGetVersionArgs, appOpenLogsFolderArgs } from './schemas/app';

const C = IPC_CHANNELS.app;

export function registerAppHandlers(): void {
  handle(
    C.getVersion,
    () => {
      return app.getVersion();
    },
    { schema: appGetVersionArgs }
  );

  handle(
    C.openLogsFolder,
    async () => {
      await shell.openPath(getLogsDir());
    },
    { schema: appOpenLogsFolderArgs }
  );
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler(C.getVersion);
  ipcMain.removeHandler(C.openLogsFolder);
}
