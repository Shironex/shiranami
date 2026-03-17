import { globalShortcut, BrowserWindow } from 'electron';
import { logger } from './logger';

let mainWindowRef: BrowserWindow | null = null;

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
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('media:command', command);
  }
}

export function initializeMediaControls(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  // Register global media key shortcuts
  const shortcuts: Record<string, string> = {
    'MediaPlayPause': 'toggle-play',
    'MediaNextTrack': 'next',
    'MediaPreviousTrack': 'previous',
    'MediaStop': 'stop',
  };

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

  logger.info('Media controls initialized');
}

export function cleanupMediaControls(): void {
  globalShortcut.unregisterAll();
  mainWindowRef = null;
}
