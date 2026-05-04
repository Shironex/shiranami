import { join } from 'path';
import * as os from 'os';
import { app, BrowserWindow, protocol } from 'electron';
import { createMainWindow } from './window';
import { cleanupIpcHandlers } from './ipc/register';
import { initializeAutoUpdater } from './updater';
import { logger, flushLogs } from './logger';
import { createTray, destroyTray } from './tray';
import { initializeMediaControls, cleanupMediaControls } from './media-controls';
import { initializeDiscordRpc, cleanupDiscordRpc } from './discord-rpc';
import { registerAudioProtocol } from './audio-protocol';
import { registerRadioProtocol } from './radio-protocol';
import { registerArtProtocol, pruneOrphanedAlbumArt } from './art-protocol';
import { migrateAlbumArtToDisk } from './migrate-album-art';
import { prewarm as prewarmFoldersCache } from './shared/folders-cache';
import { initializeDatabase, closeDatabase } from '@shiranami/database/client';

// Register shiranami:// deep link protocol for share imports.
// Only register in packaged builds — dev mode can't resolve the Electron binary correctly on Windows.
if (!process.defaultApp) {
  app.setAsDefaultProtocolClient('shiranami');
}

// Ensure single instance so deep links reuse the existing window.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Register custom protocol scheme for streaming local audio files.
// Must be called before app.ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'shiranami-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      // Required so MediaElementAudioSource (Web Audio graph) gets actual
      // samples instead of silent zeroes — connecting a cross-origin audio
      // element to AudioContext silently outputs zeroes by default.
      corsEnabled: true,
    },
  },
  {
    scheme: 'shiranami-radio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
  {
    scheme: 'shiranami-art',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: false,
      bypassCSP: false,
      // Required so the renderer can draw covers onto a <canvas> for
      // FastAverageColor / getImageData without Chromium tainting the
      // canvas as cross-origin.
      corsEnabled: true,
    },
  },
]);

export let mainWindow: BrowserWindow | null = null;
let isShuttingDown = false;
let cleanupDone = false;

/** Extract share import code from a shiranami:// deep link URL. */
function parseDeepLink(url: string): string | null {
  try {
    // URL format: shiranami://import/<code>
    const match = url.match(/^shiranami:\/\/import\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Send the import code to the renderer process. */
function handleDeepLink(url: string): void {
  const code = parseDeepLink(url);
  if (!code) return;
  logger.info(`[deep-link] Import request for code: ${code}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('share:deep-link', code);
  }
}

// Windows/Linux: second instance receives the deep link via argv
app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find(arg => arg.startsWith('shiranami://'));
  if (deepLink) {
    handleDeepLink(deepLink);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// macOS: open-url event fires when the protocol is triggered
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

async function bootstrap(): Promise<void> {
  logger.info('════════════════════════════════════════════════════════════');
  logger.info(`  New session — Shiranami v${app.getVersion()}`);
  logger.info(`[system] OS: ${os.platform()} ${os.release()} (${os.arch()})`);
  logger.info(
    `[system] Electron: ${process.versions.electron}, Chrome: ${process.versions.chrome}, Node: ${process.versions.node}`
  );
  logger.info(
    `[system] Memory: ${Math.round(os.totalmem() / 1024 / 1024)}MB, userData: ${app.getPath('userData')}`
  );
  logger.info(`[security] App packaged: ${app.isPackaged}`);
  logger.info('════════════════════════════════════════════════════════════');

  initializeDatabase({ path: join(app.getPath('userData'), 'shiranami.db') });
  logger.info('Database initialized');

  registerAudioProtocol();
  registerRadioProtocol();
  registerArtProtocol();

  // Build the path-containment cache eagerly so the first shell/audio
  // request doesn't pay the rebuild cost. Failure here must not abort
  // startup — the cache lazy-builds on first call as a fallback.
  try {
    prewarmFoldersCache();
  } catch (err) {
    logger.warn('Folders cache prewarm failed:', err);
  }

  // Migrate legacy base64 album art to disk files
  migrateAlbumArtToDisk().catch(err => {
    logger.warn('Album art migration failed:', err);
  });

  // Prune orphaned album-art files (tracks deleted between sessions, covers
  // re-encoded since the row was last written). Fire-and-forget so this
  // never blocks bootstrap; pruneOrphanedAlbumArt swallows its own errors.
  pruneOrphanedAlbumArt().catch(err => {
    logger.warn('Album art prune failed:', err);
  });

  mainWindow = await createMainWindow();

  try {
    createTray(mainWindow);
  } catch (error) {
    logger.warn('Failed to create system tray:', error);
  }

  try {
    initializeMediaControls(mainWindow);
  } catch (error) {
    logger.warn('Failed to initialize media controls:', error);
  }

  try {
    initializeDiscordRpc();
  } catch (error) {
    logger.warn('Failed to initialize Discord RPC:', error);
  }

  try {
    initializeAutoUpdater(mainWindow, !app.isPackaged);
  } catch (error) {
    logger.warn('Failed to initialize auto-updater:', error);
  }
}

process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection:', reason);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (isShuttingDown) return;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    app.quit();
  });
}

app
  .whenReady()
  .then(bootstrap)
  .catch(error => {
    logger.error('Failed to bootstrap application:', error);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    cleanupIpcHandlers();
    mainWindow = await createMainWindow();
    try {
      createTray(mainWindow);
    } catch (error) {
      logger.warn('Failed to create system tray on activate:', error);
    }
  }
});

app.on('before-quit', event => {
  mainWindow = null;

  if (cleanupDone) return;
  event.preventDefault();
  if (isShuttingDown) return;
  isShuttingDown = true;

  (async () => {
    try {
      cleanupDiscordRpc();
    } catch {
      /* ignore */
    }
    try {
      cleanupMediaControls();
    } catch {
      /* ignore */
    }
    try {
      destroyTray();
    } catch {
      /* ignore */
    }
    try {
      closeDatabase();
    } catch {
      /* ignore */
    }
    try {
      await flushLogs();
    } catch {
      /* ignore */
    }
  })().finally(() => {
    cleanupDone = true;
    app.quit();
  });
});
