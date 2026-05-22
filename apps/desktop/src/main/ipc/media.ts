import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { updateTrayWithPlaybackState } from '../tray';
import { updateDiscordPresence } from '../discord-rpc';
import { getMainWindow } from '../utils/window';
import type { PlaybackState } from '../media-controls';
import { handle } from './with-ipc-handler';
import { mediaPlaybackStateArgs, mediaClearStateArgs } from './schemas/media';

const C = IPC_CHANNELS.media;

export function registerMediaHandlers(): void {
  // Renderer sends playback state updates
  handle(
    C.playbackState,
    (_event, state: PlaybackState) => {
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
    },
    { schema: mediaPlaybackStateArgs }
  );

  // Renderer requests to clear taskbar progress
  handle(
    C.clearState,
    () => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
      }
      updateTrayWithPlaybackState(null);
      updateDiscordPresence(null);
    },
    { schema: mediaClearStateArgs }
  );
}

export function cleanupMediaHandlers(): void {
  ipcMain.removeHandler(C.playbackState);
  ipcMain.removeHandler(C.clearState);
}
