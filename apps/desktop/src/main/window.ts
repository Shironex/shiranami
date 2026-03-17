import { app, BrowserWindow, shell, session } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc/register';
import { VITE_DEV_PORT } from '@shiranami/shared';
import { logger } from './logger';

function setupContentSecurityPolicy(isDev: boolean): void {
  const urlFilter = isDev
    ? { urls: [`http://localhost:${VITE_DEV_PORT}/*`] }
    : { urls: ['file://*'] };

  session.defaultSession.webRequest.onHeadersReceived(urlFilter, (details, callback) => {
    const cspDirectives = [
      isDev
        ? `script-src 'self' http://localhost:${VITE_DEV_PORT} 'unsafe-inline' 'unsafe-eval'`
        : "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      isDev
        ? `connect-src 'self' http://localhost:${VITE_DEV_PORT} ws://localhost:${VITE_DEV_PORT}`
        : "connect-src 'self'",
      "object-src 'none'",
      "media-src 'self' blob: file: shiranami-audio:",
      "default-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
    ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')],
      },
    });
  });
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export async function createMainWindow(): Promise<BrowserWindow> {
  const isDev = process.env.NODE_ENV === 'development';

  setupContentSecurityPolicy(isDev);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Shiranami',
    backgroundColor: '#0a0a0f',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, `icon.${process.platform === 'win32' ? 'ico' : 'png'}`)
      : path.join(
          __dirname,
          `../../resources/icon.${process.platform === 'win32' ? 'ico' : 'png'}`
        ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  registerIpcHandlers(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        shell.openExternal(url);
      }
    } catch {
      /* ignore invalid URLs */
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = isDev ? [`http://localhost:${VITE_DEV_PORT}`] : ['file://'];
    const isAllowed = allowedOrigins.some(origin => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
      try {
        const parsed = new URL(url);
        if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
          shell.openExternal(url);
        }
      } catch {
        /* ignore */
      }
    }
  });

  if (isDev) {
    logger.info('Development mode - loading from Vite dev server');
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL(`http://localhost:${VITE_DEV_PORT}`).catch(err => {
      logger.error('Failed to load from Vite dev server:', err.message);
    });
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    logger.info('Production mode - loading from:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      logger.error('Failed to load renderer:', err);
    });
  }

  return mainWindow;
}
