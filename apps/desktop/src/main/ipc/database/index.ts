import type { BrowserWindow } from 'electron';
import { registerTrackHandlers, cleanupTrackHandlers } from './tracks';
import { registerHistoryHandlers, cleanupHistoryHandlers } from './history';
import { registerFolderHandlers, cleanupFolderHandlers } from './folders';
import { registerPlaylistHandlers, cleanupPlaylistHandlers } from './playlists';
import { registerBackupHandlers, cleanupBackupHandlers } from './backup';

export function registerDatabaseHandlers(mainWindow: BrowserWindow): void {
  registerTrackHandlers();
  registerHistoryHandlers();
  registerFolderHandlers();
  registerPlaylistHandlers();
  registerBackupHandlers(mainWindow);
}

export function cleanupDatabaseHandlers(): void {
  cleanupTrackHandlers();
  cleanupHistoryHandlers();
  cleanupFolderHandlers();
  cleanupPlaylistHandlers();
  cleanupBackupHandlers();
}
