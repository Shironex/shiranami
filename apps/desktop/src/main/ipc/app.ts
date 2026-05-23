import { app, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { getLogsDir } from '../logger';
import { handle } from './with-ipc-handler';
import { appGetVersionArgs, appOpenLogsFolderArgs, appGetLocaleCountryArgs } from './schemas/app';

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

  // OS region as an ISO 3166-1 alpha-2 code (e.g. "PL"), independent of the UI
  // language. Backs the radio "Near you" shortcut for renderers whose locale
  // tag carries no region subtag (e.g. bare "pl"). Returns "" when unknown.
  handle(
    C.getLocaleCountry,
    () => {
      return app.getLocaleCountryCode();
    },
    { schema: appGetLocaleCountryArgs }
  );
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler(C.getVersion);
  ipcMain.removeHandler(C.openLogsFolder);
  ipcMain.removeHandler(C.getLocaleCountry);
}
