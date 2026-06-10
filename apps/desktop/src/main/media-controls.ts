import { globalShortcut, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from './logger';
import { sendToRenderer } from './utils/window';

export interface PlaybackState {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  duration: number;
  currentTime: number;
  albumArt: string | null;
}

function sendMediaCommand(command: string): void {
  sendToRenderer(IPC_CHANNELS.media.command, command);
}

export function initializeMediaControls(_mainWindow: BrowserWindow): void {
  // Register global media key shortcuts
  const shortcuts: Record<string, string> = {
    MediaPlayPause: 'toggle-play',
    MediaNextTrack: 'next',
    MediaPreviousTrack: 'previous',
    MediaStop: 'stop',
  };

  // Skip global shortcut registration on macOS — media keys are handled
  // via the MediaSession API in the renderer process instead.
  if (process.platform !== 'darwin') {
    for (const [key, command] of Object.entries(shortcuts)) {
      try {
        const registered = globalShortcut.register(key, () => {
          sendMediaCommand(command);
        });
        if (registered) {
          logger.debug(`[media] Registered global shortcut: ${key}`);
        } else {
          logger.warn(`[media] Failed to register shortcut: ${key}`);
        }
      } catch (error) {
        logger.warn(`[media] Error registering shortcut ${key}:`, error);
      }
    }
  }

  logger.info('Media controls initialized');
}

export function cleanupMediaControls(): void {
  globalShortcut.unregisterAll();
}
