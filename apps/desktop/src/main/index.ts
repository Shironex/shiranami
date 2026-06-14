import { join } from 'path';
import * as os from 'os';
import { app, BrowserWindow, protocol } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { initSentryMain, watchTelemetryConsent } from './app/sentry';
import { createMainWindow } from './app/window';
import { cleanupIpcHandlers } from './ipc/register';
import { initializeAutoUpdater } from './app/updater';
import { logger, flushLogs } from './app/logger';
import { createTray, destroyTray } from './app/tray';
import { initializeSystemBehavior, attachTrayWindowBehavior } from './app/system-behavior';
import { initializeMediaControls, cleanupMediaControls } from './integrations/media-controls';
import { initializeDiscordRpc, cleanupDiscordRpc } from './integrations/discord-rpc';
import { registerAudioProtocol } from './protocols/audio-protocol';
import { registerRadioProtocol } from './protocols/radio-protocol';
import { registerArtProtocol, pruneOrphanedAlbumArt } from './protocols/art-protocol';
import { migrateAlbumArtToDisk } from './services/migrate-album-art';
import { emitSystemNotice } from './app/system-notice';
import { prewarm as prewarmFoldersCache } from './shared/folders-cache';
import { initializeDatabase, closeDatabase } from '@shiranami/database/client';
import { backupDatabaseOnLaunch } from './services/db-backup';
import {
  scheduleRecommendationRefresh,
  cancelRecommendationRefresh,
} from './services/recommendation-service';
import { startScrobbler, stopScrobbler } from './scrobbler';
import { PRIVILEGED_SCHEMES } from './protocols/privileged-schemes';
import { IPC_CHANNELS } from '@shiranami/contracts';

// E2E hatch: when running under @playwright/test we disable noisy bootstrap
// side-effects (tray, Discord RPC, auto-updater, OS media-controls) so the
// app window is the only observable surface and specs don't have to mock
// transient external state. The renderer still loads the production preload.
const isE2E = process.env.SHIRANAMI_E2E === '1';

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

// Crash/error reporting must initialize before BOTH the 'ready' event and our
// own registerSchemesAsPrivileged call below: @sentry/electron registers a
// privileged `sentry-ipc` scheme at init and then proxies
// registerSchemesAsPrivileged so later registrations merge rather than
// overwrite. Running it first means our schemes go through that proxy and both
// survive. No-op unless the user opted in AND the build is packaged (or
// SENTRY_FORCE_ENABLE). watchTelemetryConsent handles runtime disable and
// defers enable to the next launch (the SDK can't init post-ready).
initSentryMain();
watchTelemetryConsent();

// Must be called before app.ready.
protocol.registerSchemesAsPrivileged(PRIVILEGED_SCHEMES);

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
    mainWindow.webContents.send(IPC_CHANNELS.share.deepLink, code);
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
  // One-time GPU/HW-accel assertion so a future regression that disables
  // hardware acceleration (which would sharply raise open-state CPU because
  // compositing falls back to the CPU) is detectable in logs immediately.
  // We never call app.disableHardwareAcceleration(), so this should report
  // hardware-backed compositing.
  try {
    const gpu = app.getGPUFeatureStatus();
    logger.info(
      `[gpu] HW acceleration enabled: ${!app.commandLine.hasSwitch('disable-gpu')} | ` +
        `gpu_compositing: ${gpu.gpu_compositing ?? 'unknown'}, ` +
        `webgl: ${gpu.webgl ?? 'unknown'}, ` +
        `video_decode: ${gpu.video_decode ?? 'unknown'}`
    );
  } catch (err) {
    logger.warn('[gpu] Failed to read GPU feature status:', err);
  }
  logger.info('════════════════════════════════════════════════════════════');

  const dbPath = join(app.getPath('userData'), 'shiranami.db');
  // Snapshot the DB BEFORE migrations run so a bad upgrade leaves a
  // pre-migration copy. Best-effort — never blocks launch.
  await backupDatabaseOnLaunch(dbPath);
  initializeDatabase({ path: dbPath });
  logger.info('Database initialized');

  // Warm the recommendation discover shelf in the background once after startup
  // (only if its cache is stale). yt-dlp never runs on the render path; a
  // failure here is swallowed and the shelves simply serve the cache.
  if (!isE2E) {
    scheduleRecommendationRefresh();
    // Start the scrobble retry-queue flush loop. No network fires unless the
    // user has connected an account and enabled scrobbling.
    startScrobbler();
  }

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
    // Not awaited — this almost always settles after the window is up, so the
    // renderer can receive it. sendToRenderer no-ops safely if it's still early.
    // Shares the album-art notice code with the post-remove path (deduped).
    emitSystemNotice({ source: 'album-art', level: 'warn', code: 'albumArtPruneFailed' });
  });

  mainWindow = await createMainWindow();

  if (!isE2E) {
    try {
      createTray(mainWindow);
    } catch (error) {
      logger.warn('Failed to create system tray:', error);
    }

    try {
      initializeSystemBehavior();
      attachTrayWindowBehavior(mainWindow);
    } catch (error) {
      logger.warn('Failed to initialize system behavior prefs:', error);
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
}

process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
  Sentry.captureException(error);
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection:', reason);
  Sentry.captureException(reason);
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
    Sentry.captureException(error);
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
    if (!isE2E) {
      try {
        createTray(mainWindow);
        attachTrayWindowBehavior(mainWindow);
      } catch (error) {
        logger.warn('Failed to create system tray on activate:', error);
      }
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
      cancelRecommendationRefresh();
      stopScrobbler();
    } catch (err) {
      logger.warn('[shutdown] recommendation/scrobbler stop failed', err);
    }
    try {
      cleanupDiscordRpc();
    } catch (err) {
      logger.warn('[shutdown] discord-rpc cleanup failed', err);
    }
    try {
      cleanupMediaControls();
    } catch (err) {
      logger.warn('[shutdown] media-controls cleanup failed', err);
    }
    try {
      destroyTray();
    } catch (err) {
      logger.warn('[shutdown] tray destroy failed', err);
    }
    try {
      closeDatabase();
    } catch (err) {
      logger.warn('[shutdown] database close failed', err);
    }
    try {
      await flushLogs();
    } catch (err) {
      logger.warn('[shutdown] log flush failed', err);
    }
  })().finally(() => {
    cleanupDone = true;
    app.quit();
  });
});
