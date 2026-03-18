import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import { logger } from './logger';
import type { PlaybackState } from './media-controls';

let tray: Tray | null = null;
let mainWindowRef: BrowserWindow | null = null;
let currentState: PlaybackState | null = null;

function getTrayIconPath(): string {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../../resources');

  // Use tray-specific icon if available, otherwise fall back to app icon
  const trayIcon = path.join(resourcesDir, 'tray-icon.png');
  try {
    require('fs').accessSync(trayIcon);
    return trayIcon;
  } catch {
    // fallback
  }

  if (process.platform === 'darwin') {
    return path.join(resourcesDir, 'icon-16.png');
  }
  return path.join(resourcesDir, 'icon-32.png');
}

function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendMediaCommand(command: string): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('media:command', command);
  }
}

function rebuildContextMenu(): void {
  if (!tray || !mainWindowRef) return;

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (currentState) {
    template.push(
      {
        label: currentState.title,
        enabled: false,
      },
      {
        label: currentState.artist,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: currentState.isPlaying ? 'Pause' : 'Play',
        click: () => sendMediaCommand('toggle-play'),
      },
      {
        label: 'Previous',
        click: () => sendMediaCommand('previous'),
      },
      {
        label: 'Next',
        click: () => sendMediaCommand('next'),
      },
      { type: 'separator' },
    );
  }

  template.push(
    {
      label: 'Show Shiranami',
      click: () => showWindow(mainWindowRef!),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

export function createTray(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
  const iconPath = getTrayIconPath();
  logger.debug(`[tray] Loading icon from: ${iconPath}`);
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    logger.warn(`[tray] Icon is empty, using fallback. Path: ${iconPath}`);
    // Create a simple purple square as fallback
    const fallback = nativeImage.createFromBuffer(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMklEQVRYR+3QQREAAAjDMPB/aEMD' +
        'G4SdNXAddDaJc0AAAgQIECBAgAABAgQIECDwP/AAP4ABIW7CsGsAAAAASUVORK5CYII=',
        'base64'
      )
    );
    icon = fallback;
  }

  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);
  } else {
    icon = icon.resize({ width: 32, height: 32 });
  }

  tray = new Tray(icon);
  tray.setToolTip('Shiranami');

  rebuildContextMenu();

  tray.on('click', () => showWindow(mainWindow));

  logger.info('System tray created');
}

export function updateTrayWithPlaybackState(state: PlaybackState | null): void {
  currentState = state;

  if (tray) {
    if (state) {
      tray.setToolTip(`Shiranami — ${state.title} - ${state.artist}`);
    } else {
      tray.setToolTip('Shiranami');
    }
    rebuildContextMenu();
  }
}

export function destroyTray(): void {
  mainWindowRef = null;
  currentState = null;
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
