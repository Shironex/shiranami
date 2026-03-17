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
  let icon = nativeImage.createFromPath(iconPath);

  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);
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
