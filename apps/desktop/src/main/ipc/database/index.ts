import { registerTrackHandlers, cleanupTrackHandlers } from './tracks';
import { registerHistoryHandlers, cleanupHistoryHandlers } from './history';
import { registerFolderHandlers, cleanupFolderHandlers } from './folders';
import { registerPlaylistHandlers, cleanupPlaylistHandlers } from './playlists';

export function registerDatabaseHandlers(): void {
  registerTrackHandlers();
  registerHistoryHandlers();
  registerFolderHandlers();
  registerPlaylistHandlers();
}

export function cleanupDatabaseHandlers(): void {
  cleanupTrackHandlers();
  cleanupHistoryHandlers();
  cleanupFolderHandlers();
  cleanupPlaylistHandlers();
}
