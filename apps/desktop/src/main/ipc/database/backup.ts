import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'path';
import { IPC_CHANNELS, type DbExportResult, type DbImportResult } from '@shiranami/contracts';
import { initializeDatabase, closeDatabase } from '@shiranami/database/client';
import { logger } from '../../app/logger';
import { handle } from '../with-ipc-handler';
import { exportDatabase, importDatabase } from '../../services/db-backup';
import { dbBackupExportArgs, dbBackupImportArgs } from '../schemas/db-backup';

const B = IPC_CHANNELS.db.backup;

/** Absolute path of the live library database. */
function getDbPath(): string {
  return join(app.getPath('userData'), 'shiranami.db');
}

export function registerBackupHandlers(mainWindow: BrowserWindow): void {
  // Export a consistent copy of the library DB to a user-chosen file.
  handle(
    B.export,
    async (): Promise<DbExportResult> => {
      const stamp = new Date().toISOString().slice(0, 10);
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Library Database',
        defaultPath: `shiranami-library-${stamp}.db`,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      try {
        await exportDatabase(getDbPath(), result.filePath);
        logger.info(`[db:backup] Exported library to ${result.filePath}`);
        return { success: true, path: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[db:backup] Export failed:', err);
        return { success: false, error: message };
      }
    },
    { schema: dbBackupExportArgs }
  );

  // Replace the library DB with a user-chosen backup, then re-open + migrate it.
  handle(
    B.import,
    async (): Promise<DbImportResult> => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Library Database',
        properties: ['openFile'],
        filters: [
          { name: 'SQLite Database', extensions: ['db', 'sqlite'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const dbPath = getDbPath();
      const source = result.filePaths[0];
      try {
        // Close the live connection before swapping the file, then re-open so
        // migrations run against the imported DB (baselining a legacy backup).
        // importDatabase validates the source (valid SQLite + not a newer
        // schema) BEFORE overwriting the live file, so those failures leave the
        // original intact and the catch below re-opens it cleanly. Past the
        // copy, the swap is committed; a re-open failure there is logged and the
        // pre-import safety snapshot in /backups is the recovery path.
        closeDatabase();
        await importDatabase(dbPath, source);
        initializeDatabase({ path: dbPath });
        logger.info(`[db:backup] Imported library from ${source}`);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[db:backup] Import failed:', err);
        // Re-open the (possibly pre-import) DB so the app stays usable. If the
        // file was already swapped, this opens the imported file; if the swap
        // failed, it opens the original. Either way the connection is live.
        try {
          initializeDatabase({ path: dbPath });
        } catch (reopenErr) {
          logger.error('[db:backup] Failed to re-open database after import error:', reopenErr);
        }
        return { success: false, error: message };
      }
    },
    { schema: dbBackupImportArgs }
  );
}

export function cleanupBackupHandlers(): void {
  ipcMain.removeHandler(B.export);
  ipcMain.removeHandler(B.import);
}
