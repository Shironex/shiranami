import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { sendToRenderer } from '../utils/window';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../app/logger';
import { requestJson } from '../app/http';
import {
  getYtDlpPath,
  isYtDlpInstalled,
  getYtDlpVersion,
  getLatestYtDlpVersion,
  downloadYtDlp,
} from '../downloads/ytdlp-manager';
import {
  isFFmpegInstalled,
  getFFmpegVersion,
  getLatestFFmpegVersion,
  downloadFFmpeg,
} from '../downloads/ffmpeg-manager';
import { store } from '../app/store';
import { handle, handleWithFallback } from './with-ipc-handler';
import { IpcError } from './errors';
import { invalidate as invalidateFoldersCache } from '../shared/folders-cache';
import { runYtDlpDownload, type DownloadProgress } from '../downloads/yt-dlp-download';
import { getDownloadQueue } from '../downloads/download-queue';
import { createDownloadQueuePersistence } from '../downloads/download-queue-persistence';
import type {
  EnqueueDownloadInput,
  ToolInstallResult,
  InstallDependenciesResult,
} from '@shiranami/contracts';
import { isHttpUrl } from '../shared/url-safety';
import {
  spawnYtDlp,
  appendUrlArg,
  ytSearch,
  classifyYtDlpFailure,
  tailOutput,
  hasUpdate,
  extractVersionSegments,
  YT_DLP_ERROR_CODES,
  type SearchResult,
} from '../utils/ytdlp-spawn';

// Re-exported so existing `./downloader` consumers (and the co-located test)
// keep importing the canonical yt-dlp helpers from one place after they moved
// into utils/ytdlp-spawn.ts.
export { classifyYtDlpFailure, tailOutput, hasUpdate, extractVersionSegments, YT_DLP_ERROR_CODES };
import {
  downloaderCheckArgs,
  downloaderGetDownloadLocationArgs,
  downloaderSetDownloadLocationArgs,
  downloaderCheckDependenciesArgs,
  downloaderGetCachedToolStatusArgs,
  downloaderRefreshToolStatusArgs,
  downloaderSearchArgs,
  downloaderSuggestArgs,
  downloaderDownloadArgs,
  downloaderInstallYtdlpArgs,
  downloaderGetYtdlpPathArgs,
  downloaderCheckFfmpegArgs,
  downloaderInstallFfmpegArgs,
  downloaderGetStreamUrlArgs,
  downloaderInstallDependenciesArgs,
  downloaderEnqueueArgs,
  downloaderQueueCancelArgs,
  downloaderCancelAllArgs,
  downloaderClearCompletedArgs,
  downloaderPauseArgs,
  downloaderResumeArgs,
  downloaderMarkImportedArgs,
  downloaderGetQueueArgs,
} from './schemas/downloader';

export type { SearchResult };

const C = IPC_CHANNELS.downloader;

export type { DownloadProgress };

interface BinaryStatus {
  installed: boolean;
  version?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
}

interface DependencyInstallProgress {
  target: 'ytdlp' | 'ffmpeg';
  percent: number;
  overallPercent: number;
  label: string;
}

export type { ToolInstallResult, InstallDependenciesResult };

export interface DownloadLocationState {
  path: string;
  defaultPath: string;
  isDefault: boolean;
}

const DOWNLOAD_LOCATION_STORE_KEY = 'downloads.location' as const;
const TOOL_STATUS_CACHE_KEY = 'downloads.toolStatusCache' as const;

export interface ToolStatusCache {
  ytdlp: BinaryStatus;
  ffmpeg: BinaryStatus;
  ytdlpPath: string;
  downloadLocation: DownloadLocationState;
  timestamp: number;
}

let toolStatusCache: ToolStatusCache | null = null;

function loadCachedToolStatus(): ToolStatusCache | null {
  if (toolStatusCache) {
    logger.debug('[downloader] Returning in-memory tool status cache');
    return toolStatusCache;
  }

  try {
    const persisted = store.get(TOOL_STATUS_CACHE_KEY);
    if (persisted && typeof persisted.timestamp === 'number') {
      toolStatusCache = persisted;
      logger.info(
        `[downloader] Loaded tool status from persistent cache (age: ${Date.now() - persisted.timestamp}ms)`
      );
      return persisted;
    }
  } catch (err) {
    logger.warn('[downloader] Failed to load cached tool status:', err);
  }
  return null;
}

function persistToolStatusCache(cache: ToolStatusCache): void {
  toolStatusCache = cache;
  store.set(TOOL_STATUS_CACHE_KEY, cache);
  logger.debug('[downloader] Tool status cache persisted');
}

async function fetchAndCacheToolStatus(): Promise<ToolStatusCache> {
  logger.info('[downloader] Fetching fresh tool status...');
  const [ytdlp, ffmpeg, ytdlpPath, downloadLocation] = await Promise.all([
    getYtDlpStatus(),
    getFFmpegStatus(),
    Promise.resolve(getYtDlpPath()),
    Promise.resolve(getDownloadLocationState()),
  ]);

  const cache: ToolStatusCache = {
    ytdlp,
    ffmpeg,
    ytdlpPath,
    downloadLocation,
    timestamp: Date.now(),
  };

  persistToolStatusCache(cache);
  logger.info(
    `[downloader] Tool status refreshed — yt-dlp: ${ytdlp.installed ? 'installed' : 'missing'}, ffmpeg: ${ffmpeg.installed ? 'installed' : 'missing'}`
  );
  return cache;
}

function invalidateToolStatusCache(): void {
  toolStatusCache = null;
  store.delete(TOOL_STATUS_CACHE_KEY);
  logger.info('[downloader] Tool status cache invalidated');
}

function getDefaultDownloadDir(): string {
  const musicDir = app.getPath('music');
  return path.join(musicDir, 'Shiranami Downloads');
}

function ensureDownloadDir(downloadDir: string): string {
  fs.mkdirSync(downloadDir, { recursive: true });
  return downloadDir;
}

function getStoredDownloadDir(): string | null {
  const configuredPath = store.get(DOWNLOAD_LOCATION_STORE_KEY);
  if (typeof configuredPath !== 'string') {
    return null;
  }

  const trimmed = configuredPath.trim();
  return trimmed.length > 0 ? path.resolve(trimmed) : null;
}

function getDownloadDir(): string {
  return ensureDownloadDir(getStoredDownloadDir() ?? getDefaultDownloadDir());
}

/**
 * Active download directory (without ensuring it exists). Exposed for
 * other modules (e.g. folders-cache) that need the configured location
 * without triggering directory creation.
 */
export function getCurrentDownloadDir(): string {
  return getStoredDownloadDir() ?? getDefaultDownloadDir();
}

function getDownloadLocationState(): DownloadLocationState {
  const defaultPath = getDefaultDownloadDir();
  const selectedPath = getStoredDownloadDir() ?? defaultPath;
  return {
    path: ensureDownloadDir(selectedPath),
    defaultPath,
    isDefault: path.normalize(selectedPath) === path.normalize(defaultPath),
  };
}

async function getYtDlpStatus(): Promise<BinaryStatus> {
  const installed = isYtDlpInstalled();

  const [version, latestVersion] = await Promise.all([
    installed ? getYtDlpVersion().catch(() => null) : Promise.resolve<string | null>(null),
    getLatestYtDlpVersion().catch(() => null),
  ]);

  return {
    installed,
    version: version ?? undefined,
    latestVersion: latestVersion ?? undefined,
    updateAvailable: installed ? hasUpdate(version, latestVersion) : undefined,
  };
}

async function getFFmpegStatus(): Promise<BinaryStatus> {
  const installed = isFFmpegInstalled();

  const [version, latestVersion] = await Promise.all([
    installed ? getFFmpegVersion().catch(() => null) : Promise.resolve<string | null>(null),
    getLatestFFmpegVersion().catch(() => null),
  ]);

  return {
    installed,
    version: version ?? undefined,
    latestVersion: latestVersion ?? undefined,
    updateAvailable: installed ? hasUpdate(version, latestVersion) : undefined,
  };
}

export function registerDownloaderHandlers(): void {
  handle(
    C.getDownloadLocation,
    async () => {
      return getDownloadLocationState();
    },
    { schema: downloaderGetDownloadLocationArgs }
  );

  handle(
    C.setDownloadLocation,
    async (_event, downloadDir: string | null) => {
      const defaultPath = getDefaultDownloadDir();

      if (typeof downloadDir !== 'string' || downloadDir.trim().length === 0) {
        store.delete(DOWNLOAD_LOCATION_STORE_KEY);
        invalidateFoldersCache();
        return getDownloadLocationState();
      }

      const resolvedPath = ensureDownloadDir(path.resolve(downloadDir.trim()));
      if (path.normalize(resolvedPath) === path.normalize(defaultPath)) {
        store.delete(DOWNLOAD_LOCATION_STORE_KEY);
      } else {
        store.set(DOWNLOAD_LOCATION_STORE_KEY, resolvedPath);
      }

      invalidateFoldersCache();
      return getDownloadLocationState();
    },
    { schema: downloaderSetDownloadLocationArgs }
  );

  handle(
    C.checkDependencies,
    async () => {
      return {
        ytdlpInstalled: isYtDlpInstalled(),
        ffmpegInstalled: isFFmpegInstalled(),
      };
    },
    { schema: downloaderCheckDependenciesArgs }
  );

  handle(
    C.getCachedToolStatus,
    async () => {
      return loadCachedToolStatus();
    },
    { schema: downloaderGetCachedToolStatusArgs }
  );

  handleWithFallback(
    C.refreshToolStatus,
    () => fetchAndCacheToolStatus(),
    () => loadCachedToolStatus(),
    { schema: downloaderRefreshToolStatusArgs }
  );

  handleWithFallback(
    C.check,
    () => getYtDlpStatus(),
    () => ({ installed: isYtDlpInstalled() }) as BinaryStatus,
    { schema: downloaderCheckArgs }
  );

  handle(
    C.search,
    async (_event, query: string) => {
      logger.info(`[downloader] Searching: ${query}`);
      const results = await ytSearch(query, { limit: 10 });
      logger.info(`[downloader] Found ${results.length} results`);
      return results;
    },
    { schema: downloaderSearchArgs }
  );

  handleWithFallback(
    C.suggest,
    async (_event, query: string) => {
      const url = `https://clients1.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
      const data = await requestJson<[string, string[]]>(url);
      return Array.isArray(data[1]) ? data[1] : [];
    },
    () => [] as string[],
    { schema: downloaderSuggestArgs }
  );

  handle(
    C.download,
    async (_event, opts: { url: string; outputDir?: string }) => {
      const { url, outputDir } = opts;
      // Reject non-http(s) URLs up front: stops argument injection into yt-dlp
      // (e.g. a `--exec=<cmd>` value from a tampered playlist/share payload).
      if (!isHttpUrl(url)) {
        throw new IpcError('downloader.invalid_url', 'Refusing to download a non-http(s) URL');
      }
      const downloadDir = outputDir ?? getDownloadDir();
      fs.mkdirSync(downloadDir, { recursive: true });

      logger.info(`[downloader] Downloading: ${url} -> ${downloadDir}`);

      return runYtDlpDownload({ url, downloadDir }, progress => {
        sendToRenderer(C.progress, progress);
      });
    },
    { schema: downloaderDownloadArgs }
  );

  const downloadQueue = getDownloadQueue({
    getDownloadDir,
    persistence: createDownloadQueuePersistence(),
  });
  // Reload any persisted queue + resume downloading. Runs here (during IPC
  // registration, which happens after `initializeDatabase()`), so the DB is
  // ready and construction itself stays side-effect-free.
  downloadQueue.hydrateAndResume();

  handle(
    C.enqueue,
    async (_event, input: EnqueueDownloadInput) => {
      // Same argument-injection guard as the legacy `download` handler.
      if (!isHttpUrl(input.url)) {
        throw new IpcError('downloader.invalid_url', 'Refusing to download a non-http(s) URL');
      }
      return downloadQueue.enqueue(input);
    },
    { schema: downloaderEnqueueArgs }
  );

  handle(
    C.cancel,
    async (_event, id: string) => {
      downloadQueue.cancel(id);
    },
    { schema: downloaderQueueCancelArgs }
  );

  handle(
    C.cancelAll,
    async () => {
      downloadQueue.cancelAll();
    },
    { schema: downloaderCancelAllArgs }
  );

  handle(
    C.clearCompleted,
    async () => {
      downloadQueue.clearCompleted();
    },
    { schema: downloaderClearCompletedArgs }
  );

  handle(
    C.pause,
    async () => {
      downloadQueue.pause();
    },
    { schema: downloaderPauseArgs }
  );

  handle(
    C.resume,
    async () => {
      downloadQueue.resume();
    },
    { schema: downloaderResumeArgs }
  );

  handle(
    C.markImported,
    async (_event, ids: string[]) => {
      downloadQueue.markImported(ids);
    },
    { schema: downloaderMarkImportedArgs }
  );

  handle(
    C.getQueue,
    async () => {
      return downloadQueue.getSnapshot();
    },
    { schema: downloaderGetQueueArgs }
  );

  handle(
    C.getStreamUrl,
    async (_event, url: string) => {
      if (!isHttpUrl(url)) {
        throw new IpcError('downloader.invalid_url', 'Refusing to resolve a non-http(s) URL');
      }
      logger.info(`[downloader] Getting stream URL for: ${url}`);
      const { stdout, stderr, code } = await spawnYtDlp(
        appendUrlArg(['-f', 'bestaudio', '--get-url', '--no-warnings'], url)
      );

      if (code !== 0) {
        const reason = classifyYtDlpFailure(`${stderr}\n${stdout}`);
        logger.error(
          `[downloader] yt-dlp failed to extract stream URL for ${url} (exit ${code}): ${reason}`,
          { stderrTail: tailOutput(stderr) }
        );
        throw new IpcError('downloader.stream_url_failed', reason);
      }

      const streamUrl = stdout.trim().split('\n')[0];
      if (!streamUrl) {
        throw new IpcError('downloader.no_stream_url', 'No stream URL returned');
      }

      logger.info(`[downloader] Got stream URL for: ${url}`);
      return streamUrl;
    },
    { schema: downloaderGetStreamUrlArgs }
  );

  handle(
    C.installYtdlp,
    async () => {
      try {
        await downloadYtDlp(percent => {
          sendToRenderer(C.installProgress, { percent });
        });
        invalidateToolStatusCache();
      } catch (err) {
        logger.error('[downloader] Failed to install yt-dlp:', err);
        throw new IpcError(
          'downloader.install_failed',
          err instanceof Error ? err.message : String(err)
        );
      }
    },
    { schema: downloaderInstallYtdlpArgs }
  );

  handle(
    C.getYtdlpPath,
    async () => {
      return getYtDlpPath();
    },
    { schema: downloaderGetYtdlpPathArgs }
  );

  handleWithFallback(
    C.checkFfmpeg,
    () => getFFmpegStatus(),
    () => ({ installed: isFFmpegInstalled() }) as BinaryStatus,
    { schema: downloaderCheckFfmpegArgs }
  );

  handle(
    C.installFfmpeg,
    async () => {
      try {
        await downloadFFmpeg(percent => {
          sendToRenderer(C.ffmpegInstallProgress, { percent });
        });
        invalidateToolStatusCache();
      } catch (err) {
        logger.error('[downloader] Failed to install ffmpeg:', err);
        throw new IpcError(
          'downloader.install_failed',
          err instanceof Error ? err.message : String(err)
        );
      }
    },
    { schema: downloaderInstallFfmpegArgs }
  );

  handle(
    C.installDependencies,
    async (): Promise<InstallDependenciesResult> => {
      const targets: Array<'ytdlp' | 'ffmpeg'> = [];

      if (!isYtDlpInstalled()) {
        targets.push('ytdlp');
      }
      if (!isFFmpegInstalled()) {
        targets.push('ffmpeg');
      }

      if (targets.length === 0) {
        return { results: [] };
      }

      const stepWeight = 100 / targets.length;
      const sendProgress = (progress: DependencyInstallProgress) => {
        sendToRenderer(C.dependencyInstallProgress, progress);
      };

      const results: ToolInstallResult[] = [];

      for (const [index, target] of targets.entries()) {
        const offset = index * stepWeight;

        try {
          if (target === 'ytdlp') {
            await downloadYtDlp(percent => {
              sendProgress({
                target,
                percent,
                overallPercent: Math.min(100, Math.round(offset + (percent / 100) * stepWeight)),
                label:
                  targets.length > 1
                    ? `Installing yt-dlp (${index + 1}/${targets.length})`
                    : 'Installing yt-dlp',
              });
            });
          } else {
            await downloadFFmpeg(percent => {
              sendProgress({
                target,
                percent,
                overallPercent: Math.min(100, Math.round(offset + (percent / 100) * stepWeight)),
                label:
                  targets.length > 1
                    ? `Installing ffmpeg (${index + 1}/${targets.length})`
                    : 'Installing ffmpeg',
              });
            });
          }

          results.push({ tool: target, success: true });
        } catch (err) {
          logger.error(`[downloader] Failed to install ${target}:`, err);
          results.push({
            tool: target,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      invalidateToolStatusCache();
      return { results };
    },
    { schema: downloaderInstallDependenciesArgs }
  );

  // Background refresh on startup — populate cache silently
  fetchAndCacheToolStatus().catch(err => {
    logger.warn('[downloader] Background tool status refresh failed:', err);
  });
}

export function cleanupDownloaderHandlers(): void {
  ipcMain.removeHandler(C.getDownloadLocation);
  ipcMain.removeHandler(C.setDownloadLocation);
  ipcMain.removeHandler(C.checkDependencies);
  ipcMain.removeHandler(C.getCachedToolStatus);
  ipcMain.removeHandler(C.refreshToolStatus);
  ipcMain.removeHandler(C.check);
  ipcMain.removeHandler(C.search);
  ipcMain.removeHandler(C.download);
  ipcMain.removeHandler(C.enqueue);
  ipcMain.removeHandler(C.cancel);
  ipcMain.removeHandler(C.cancelAll);
  ipcMain.removeHandler(C.clearCompleted);
  ipcMain.removeHandler(C.pause);
  ipcMain.removeHandler(C.resume);
  ipcMain.removeHandler(C.markImported);
  ipcMain.removeHandler(C.getQueue);
  ipcMain.removeHandler(C.getStreamUrl);
  ipcMain.removeHandler(C.installYtdlp);
  ipcMain.removeHandler(C.getYtdlpPath);
  ipcMain.removeHandler(C.checkFfmpeg);
  ipcMain.removeHandler(C.installFfmpeg);
  ipcMain.removeHandler(C.installDependencies);
}
