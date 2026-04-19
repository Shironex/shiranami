import { ipcMain, shell } from 'electron';
import { logger } from '../logger';
import { isPathAllowed } from '../shared/folders-cache';
import { handle } from './with-ipc-handler';
import { IpcError, VALIDATION_ERROR_CODES } from './errors';
import { showInFolderArgs, trashFileArgs } from './schemas/shell';

export function registerShellHandlers(): void {
  handle(
    'shell:show-in-folder',
    async (_event, filePath: string) => {
      if (!(await isPathAllowed(filePath))) {
        logger.warn(`[shell:show-in-folder] blocked path outside allowed roots: ${filePath}`);
        throw new IpcError(
          VALIDATION_ERROR_CODES.FORBIDDEN,
          'Path is not within an allowed root',
          { path: filePath },
        );
      }
      shell.showItemInFolder(filePath);
    },
    { schema: showInFolderArgs },
  );

  handle(
    'shell:trash-file',
    async (_event, filePath: string) => {
      if (!(await isPathAllowed(filePath))) {
        logger.warn(`[shell:trash-file] blocked path outside allowed roots: ${filePath}`);
        throw new IpcError(
          VALIDATION_ERROR_CODES.FORBIDDEN,
          'Path is not within an allowed root',
          { path: filePath },
        );
      }
      await shell.trashItem(filePath);
    },
    { schema: trashFileArgs },
  );
}

export function cleanupShellHandlers(): void {
  ipcMain.removeHandler('shell:show-in-folder');
  ipcMain.removeHandler('shell:trash-file');
}
