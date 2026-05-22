import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { folders, eq, type NewFolder } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from '../../logger';
import { handle } from '../with-ipc-handler';
import { invalidate as invalidateFoldersCache } from '../../shared/folders-cache';
import {
  foldersGetAllArgs,
  foldersAddArgs,
  foldersRemoveArgs,
  foldersUpdateScannedArgs,
} from '../schemas/db-folders';

const F = IPC_CHANNELS.db.folders;

export function registerFolderHandlers(): void {
  handle(
    F.getAll,
    async () => {
      const db = getDatabase();
      return db.select().from(folders).all();
    },
    { schema: foldersGetAllArgs }
  );

  handle(
    F.add,
    async (_event, folderPath: string) => {
      logger.info(`[database] folders:add: "${folderPath}"`);
      const db = getDatabase();
      const id = crypto.randomUUID();
      const row: NewFolder = { id, path: folderPath };
      const inserted = db.insert(folders).values(row).returning().get();
      invalidateFoldersCache();
      return inserted;
    },
    { schema: foldersAddArgs }
  );

  handle(
    F.remove,
    async (_event, id: string) => {
      logger.info(`[database] folders:remove: ${id}`);
      const db = getDatabase();
      db.delete(folders).where(eq(folders.id, id)).run();
      invalidateFoldersCache();
    },
    { schema: foldersRemoveArgs }
  );

  handle(
    F.updateScanned,
    async (_event, id: string) => {
      const db = getDatabase();
      return db
        .update(folders)
        .set({ lastScanned: new Date().toISOString() })
        .where(eq(folders.id, id))
        .returning()
        .get();
    },
    { schema: foldersUpdateScannedArgs }
  );
}

export function cleanupFolderHandlers(): void {
  ipcMain.removeHandler(F.getAll);
  ipcMain.removeHandler(F.add);
  ipcMain.removeHandler(F.remove);
  ipcMain.removeHandler(F.updateScanned);
}
