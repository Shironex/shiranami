import { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from './logger';
import { sendToRenderer } from './utils/window';

const U = IPC_CHANNELS.updater;

let updaterEnabled = false;
let updaterInitialized = false;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function parseReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') return releaseNotes;
  return releaseNotes
    .map(entry => entry.note)
    .filter(Boolean)
    .join('\n\n');
}

export function initializeAutoUpdater(_mainWindow: BrowserWindow, isDev: boolean): void {
  if (isDev) {
    logger.info('[updater] Skipping auto-updater in development mode');
    updaterEnabled = false;
    return;
  }

  if (process.platform === 'darwin') {
    logger.info('[updater] Auto-updater disabled on macOS (unsigned app)');
    updaterEnabled = false;
    return;
  }

  updaterEnabled = true;

  if (updaterInitialized) return;
  updaterInitialized = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('[updater] Checking for update...');
    sendToRenderer(U.checkingForUpdate);
  });

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    logger.info(`[updater] Update available: ${info.version}`);
    sendToRenderer(U.updateAvailable, {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
    logger.info(`[updater] Up to date: ${info.version}`);
    sendToRenderer(U.updateNotAvailable);
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendToRenderer(U.downloadProgress, {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    logger.info(`[updater] Update downloaded: ${info.version}`);
    sendToRenderer(U.updateDownloaded, {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    const isReleasePending =
      /Cannot find latest\.yml/.test(error.message) ||
      (error.message.includes('.yml') && error.message.includes('404'));

    if (isReleasePending) {
      logger.warn('[updater] Release artifacts not yet available (build may still be in progress)');
      sendToRenderer(U.error, 'RELEASE_PENDING');
    } else {
      logger.error('[updater] Error:', error);
      sendToRenderer(U.error, error.message);
    }
  });

  // Initial check after 5 seconds
  setTimeout(() => {
    checkForUpdates();
  }, 5000);

  // Periodic checks every hour
  setInterval(
    () => {
      checkForUpdates();
    },
    60 * 60 * 1000
  );
}

export async function checkForUpdates(): Promise<{ enabled: boolean }> {
  if (!updaterEnabled) {
    return { enabled: false };
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('[updater] Failed to check for updates:', error);
  }
  return { enabled: true };
}

export async function downloadUpdate(): Promise<void> {
  logger.info('[updater] Starting update download...');
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  logger.info('[updater] Quitting and installing update...');
  autoUpdater.quitAndInstall();
}
