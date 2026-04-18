import { app, ipcMain, shell } from 'electron';
import { getLogsDir } from '../logger';
import { handle } from './with-ipc-handler';
import { appGetVersionArgs, appOpenLogsFolderArgs } from './schemas/app';

export function registerAppHandlers(): void {
  handle(
    'app:get-version',
    () => {
      return app.getVersion();
    },
    { schema: appGetVersionArgs },
  );

  handle(
    'app:open-logs-folder',
    async () => {
      await shell.openPath(getLogsDir());
    },
    { schema: appOpenLogsFolderArgs },
  );
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:open-logs-folder');
}
