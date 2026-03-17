import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { cleanupIpcHandlers } from './ipc/register';
import { logger, flushLogs } from './logger';
import { createTray, destroyTray } from './tray';

export let mainWindow: BrowserWindow | null = null;
let isShuttingDown = false;
let cleanupDone = false;

async function bootstrap(): Promise<void> {
  logger.info(`Shiranami v${app.getVersion()} starting...`);
  logger.info(`[security] App packaged: ${app.isPackaged}`);

  mainWindow = await createMainWindow();

  try {
    createTray(mainWindow);
  } catch (error) {
    logger.warn('Failed to create system tray:', error);
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
      destroyTray();
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
