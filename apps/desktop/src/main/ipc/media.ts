import { BrowserWindow, ipcMain } from 'electron';
import { updateTrayWithPlaybackState } from '../tray';
import { updateDiscordPresence } from '../discord-rpc';
import type { PlaybackState } from '../media-controls';

export function registerMediaHandlers(mainWindow: BrowserWindow): void {
  // Renderer sends playback state updates
  ipcMain.on('media:playback-state', (_event, state: PlaybackState) => {
    // Update tray tooltip with now-playing info
    updateTrayWithPlaybackState(state);

    // Update Discord Rich Presence
    updateDiscordPresence(state);

    // Update taskbar progress (Windows)
    if (process.platform === 'win32' && !mainWindow.isDestroyed()) {
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
  ipcMain.on('media:clear-state', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }
    updateTrayWithPlaybackState(null);
    updateDiscordPresence(null);
  });
}

export function cleanupMediaHandlers(): void {
  ipcMain.removeAllListeners('media:playback-state');
  ipcMain.removeAllListeners('media:clear-state');
}
