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
      // Scripts: self only in prod; dev needs eval for Vite HMR
      isDev
        ? `script-src 'self' http://localhost:${VITE_DEV_PORT} 'unsafe-inline' 'unsafe-eval'`
        : "script-src 'self'",
      // Styles: inline needed for Tailwind/CSS-in-JS + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Images: shiranami-art:// protocol for album art, https for thumbnails, http for radio favicons
      "img-src 'self' data: blob: https: http: shiranami-art:",
      // Fonts: Google Fonts + self
      "font-src 'self' data: https://fonts.gstatic.com",
      // Connections: LRCLIB for lyrics, yt-dlp thumbnails; dev adds Vite WS
      isDev
        ? `connect-src 'self' http://localhost:${VITE_DEV_PORT} ws://localhost:${VITE_DEV_PORT} https://lrclib.net https://i.ytimg.com https://*.api.radio-browser.info`
        : "connect-src 'self' https://lrclib.net https://i.ytimg.com https://*.api.radio-browser.info",
      // No plugins/embeds
      "object-src 'none'",
      // Audio: custom protocol + local files
      "media-src 'self' blob: shiranami-audio: shiranami-radio:",
      // Default restrictive
      "default-src 'self'",
      // Forms: same-origin only
      "form-action 'self'",
      // Base URI restriction
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

  // Capture renderer crashes
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`[renderer] Process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`[renderer] Failed to load: ${errorDescription} (code: ${errorCode})`);
  });

  // Forward renderer console errors/warnings to main process log file
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    // level: 0=debug, 1=info, 2=warn, 3=error
    if (level >= 2) {
      const source = sourceId ? `${sourceId}:${line}` : '';
      if (level === 3) {
        logger.error(`[renderer] ${message}`, source);
      } else {
        logger.warn(`[renderer] ${message}`, source);
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
