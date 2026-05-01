import { BrowserWindow, ipcMain, type Rectangle } from 'electron';
import { handle } from './with-ipc-handler';
import {
  windowMinimizeArgs,
  windowMaximizeArgs,
  windowCloseArgs,
  windowIsMaximizedArgs,
  windowSetAlwaysOnTopArgs,
  windowSetCompactModeArgs,
} from './schemas/window';

const DEFAULT_MIN_WIDTH = 800;
const DEFAULT_MIN_HEIGHT = 600;
const COMPACT_DEFAULT_WIDTH = 500;
const COMPACT_DEFAULT_HEIGHT = 214;

export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  let isCompactMode = false;
  let normalBounds: Rectangle | null = null;
  let wasMaximizedBeforeCompact = false;

  handle(
    'window:minimize',
    () => {
      mainWindow.minimize();
    },
    { schema: windowMinimizeArgs }
  );

  handle(
    'window:maximize',
    () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    },
    { schema: windowMaximizeArgs }
  );

  handle(
    'window:close',
    () => {
      mainWindow.close();
    },
    { schema: windowCloseArgs }
  );

  handle(
    'window:is-maximized',
    () => {
      return mainWindow.isMaximized();
    },
    { schema: windowIsMaximizedArgs }
  );

  handle(
    'window:set-always-on-top',
    (_event, alwaysOnTop: boolean) => {
      mainWindow.setAlwaysOnTop(alwaysOnTop);
    },
    { schema: windowSetAlwaysOnTopArgs }
  );

  handle(
    'window:set-compact-mode',
    (_event, compactMode: boolean, dimensions?: { width: number; height: number }) => {
      const width = dimensions?.width ?? COMPACT_DEFAULT_WIDTH;
      const height = dimensions?.height ?? COMPACT_DEFAULT_HEIGHT;

      // If we're already in compact mode and the call is also asking for
      // compact, treat it as a resize: switch to the new locked dimensions
      // without re-saving normalBounds (we'd overwrite them with the current
      // compact bounds, losing the original maximized/restored state).
      if (compactMode && isCompactMode) {
        mainWindow.setMinimumSize(width, height);
        mainWindow.setMaximumSize(width, height);
        mainWindow.setSize(width, height, true);
        return;
      }

      if (compactMode === isCompactMode) return;

      if (compactMode) {
        wasMaximizedBeforeCompact = mainWindow.isMaximized();
        normalBounds = mainWindow.getNormalBounds();

        if (wasMaximizedBeforeCompact) {
          mainWindow.unmaximize();
        }

        mainWindow.setResizable(false);
        mainWindow.setMinimizable(true);
        mainWindow.setMinimumSize(width, height);
        mainWindow.setMaximumSize(width, height);
        mainWindow.setSize(width, height, true);
        isCompactMode = true;
        return;
      }

      mainWindow.setResizable(true);
      mainWindow.setMinimumSize(DEFAULT_MIN_WIDTH, DEFAULT_MIN_HEIGHT);
      mainWindow.setMaximumSize(0, 0);

      if (wasMaximizedBeforeCompact) {
        mainWindow.maximize();
      } else if (normalBounds) {
        mainWindow.setBounds(normalBounds, true);
      }

      wasMaximizedBeforeCompact = false;
      isCompactMode = false;
    },
    { schema: windowSetCompactModeArgs }
  );

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });
}

export function cleanupWindowHandlers(): void {
  ipcMain.removeHandler('window:minimize');
  ipcMain.removeHandler('window:maximize');
  ipcMain.removeHandler('window:close');
  ipcMain.removeHandler('window:is-maximized');
  ipcMain.removeHandler('window:set-always-on-top');
  ipcMain.removeHandler('window:set-compact-mode');
}
