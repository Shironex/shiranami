import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron';
import { handle } from './with-ipc-handler';
import { store } from '../store';
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
const COMPACT_BOUNDS_KEY = 'compact-window-bounds';

/**
 * Returns a position for the compact window: the user's last-saved corner if
 * we have one and it falls within a currently-connected display work area, or
 * `null` to let Electron's default placement (top-left of normalBounds) win.
 *
 * Guards against a saved position from a now-disconnected monitor pulling the
 * window offscreen by validating against every display's `workArea` (the
 * monitor minus taskbar/menu reservations).
 */
function getValidCompactPosition(width: number, height: number): { x: number; y: number } | null {
  const saved = store.get(COMPACT_BOUNDS_KEY);
  if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return null;

  const displays = screen.getAllDisplays();
  // The window is considered onscreen if at least 80px of it lands within
  // some display's work area on each axis. That tolerance keeps a slightly
  // off-edge window restoreable while still rejecting one that's mostly on a
  // monitor that's no longer connected.
  const VISIBLE_PX = 80;
  const visible = displays.some(d => {
    const wa = d.workArea;
    const xVisible =
      saved.x + width >= wa.x + VISIBLE_PX && saved.x <= wa.x + wa.width - VISIBLE_PX;
    const yVisible =
      saved.y + height >= wa.y + VISIBLE_PX && saved.y <= wa.y + wa.height - VISIBLE_PX;
    return xVisible && yVisible;
  });

  return visible ? { x: saved.x, y: saved.y } : null;
}

export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  let isCompactMode = false;
  let normalBounds: Rectangle | null = null;
  let wasMaximizedBeforeCompact = false;

  const persistCompactBounds = () => {
    if (!isCompactMode) return;
    try {
      const bounds = mainWindow.getBounds();
      store.set(COMPACT_BOUNDS_KEY, { x: bounds.x, y: bounds.y });
    } catch {
      // ignore — bounds read can fail in unusual platform states
    }
  };

  // Quitting from compact mode (taskbar, Alt+F4, system shortcut) bypasses
  // the explicit exit-compact path, so we'd otherwise lose the user's last
  // mini-player position. Snapshot here so the next session restores cleanly.
  mainWindow.on('close', persistCompactBounds);

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

        const lastPosition = getValidCompactPosition(width, height);
        if (lastPosition) {
          mainWindow.setBounds({ ...lastPosition, width, height }, true);
        } else {
          mainWindow.setSize(width, height, true);
        }
        isCompactMode = true;
        return;
      }

      // Persist where the user parked the mini-player so the next session
      // restores into the same screen corner. Snapshot before unlocking size
      // constraints so a transient resize doesn't pollute the saved position.
      persistCompactBounds();

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
