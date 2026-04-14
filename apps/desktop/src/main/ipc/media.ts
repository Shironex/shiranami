import { ipcMain } from 'electron';
import { updateTrayWithPlaybackState } from '../tray';
import { updateDiscordPresence } from '../discord-rpc';
import { getMainWindow } from '../utils/window';
import type { PlaybackState } from '../media-controls';

export function registerMediaHandlers(): void {
  // Renderer sends playback state updates
  ipcMain.handle('media:playback-state', (_event, state: PlaybackState) => {
    // Update tray tooltip with now-playing info
    updateTrayWithPlaybackState(state);

    // Update Discord Rich Presence
    updateDiscordPresence(state);

    // Update taskbar progress (Windows)
    if (process.platform === 'win32') {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return;

      if (state.isPlaying && state.duration > 0) {
        mainWindow.setProgressBar(state.currentTime / state.duration);
      } else if (!state.isPlaying && state.duration > 0) {
        mainWindow.setProgressBar(state.currentTime / state.duration, { mode: 'paused' });
      } else {
        mainWindow.setProgressBar(-1); // Remove progress bar
      }
    }
  });

  // Renderer requests to clear taskbar progress
  ipcMain.handle('media:clear-state', () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }
    updateTrayWithPlaybackState(null);
    updateDiscordPresence(null);
  });
}

export function cleanupMediaHandlers(): void {
  ipcMain.removeHandler('media:playback-state');
  ipcMain.removeHandler('media:clear-state');
}
