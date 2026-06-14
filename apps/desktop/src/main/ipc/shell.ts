import { ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from '../app/logger';
import { isPathAllowed } from '../shared/folders-cache';
import { handle } from './with-ipc-handler';
import { IpcError, VALIDATION_ERROR_CODES } from './errors';
import { showInFolderArgs, trashFileArgs } from './schemas/shell';

const C = IPC_CHANNELS.shell;

export function registerShellHandlers(): void {
  handle(
    C.showInFolder,
    async (_event, filePath: string) => {
      if (!(await isPathAllowed(filePath))) {
        logger.warn(`[shell:show-in-folder] blocked path outside allowed roots: ${filePath}`);
        throw new IpcError(VALIDATION_ERROR_CODES.FORBIDDEN, 'Path is not within an allowed root', {
          path: filePath,
        });
      }
      shell.showItemInFolder(filePath);
    },
    { schema: showInFolderArgs }
  );

  handle(
    C.trashFile,
    async (_event, filePath: string) => {
      if (!(await isPathAllowed(filePath))) {
        logger.warn(`[shell:trash-file] blocked path outside allowed roots: ${filePath}`);
        throw new IpcError(VALIDATION_ERROR_CODES.FORBIDDEN, 'Path is not within an allowed root', {
          path: filePath,
        });
      }
      await shell.trashItem(filePath);
    },
    { schema: trashFileArgs }
  );
}

export function cleanupShellHandlers(): void {
  ipcMain.removeHandler(C.showInFolder);
  ipcMain.removeHandler(C.trashFile);
}
