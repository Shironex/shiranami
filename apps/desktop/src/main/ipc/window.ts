import { BrowserWindow, ipcMain, type Rectangle } from 'electron';

const DEFAULT_MIN_WIDTH = 800;
const DEFAULT_MIN_HEIGHT = 600;
const COMPACT_WIDTH = 500;
const COMPACT_HEIGHT = 214;

export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  let isCompactMode = false;
  let normalBounds: Rectangle | null = null;
  let wasMaximizedBeforeCompact = false;

  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized();
  });

  ipcMain.handle('window:set-always-on-top', (_event, alwaysOnTop: boolean) => {
    mainWindow.setAlwaysOnTop(alwaysOnTop);
  });

  ipcMain.handle('window:set-compact-mode', (_event, compactMode: boolean) => {
    if (compactMode === isCompactMode) return;

    if (compactMode) {
      wasMaximizedBeforeCompact = mainWindow.isMaximized();
      normalBounds = mainWindow.getNormalBounds();

      if (wasMaximizedBeforeCompact) {
        mainWindow.unmaximize();
      }

      mainWindow.setResizable(false);
      mainWindow.setMinimizable(true);
      mainWindow.setMinimumSize(COMPACT_WIDTH, COMPACT_HEIGHT);
      mainWindow.setMaximumSize(COMPACT_WIDTH, COMPACT_HEIGHT);
      mainWindow.setSize(COMPACT_WIDTH, COMPACT_HEIGHT, true);
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
  });

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
