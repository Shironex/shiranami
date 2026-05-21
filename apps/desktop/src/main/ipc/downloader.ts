import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { sendToRenderer } from '../utils/window';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { logger } from '../logger';
import { requestJson } from '../http';
import {
  getYtDlpPath,
  isYtDlpInstalled,
  getYtDlpVersion,
  getLatestYtDlpVersion,
  downloadYtDlp,
} from '../ytdlp-manager';
import {
  getFFmpegDir,
  isFFmpegInstalled,
  getFFmpegVersion,
  getLatestFFmpegVersion,
  downloadFFmpeg,
} from '../ffmpeg-manager';
import { store } from '../store';
import { handle, handleWithFallback } from './with-ipc-handler';
import { IpcError } from './errors';
import { invalidate as invalidateFoldersCache } from '../shared/folders-cache';
import {
  spawnYtDlp,
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
} from './schemas/downloader';

export type { SearchResult };

const C = IPC_CHANNELS.downloader;

export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
}

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

import type { ToolInstallResult, InstallDependenciesResult } from '../preload/types';

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
      const downloadDir = outputDir ?? getDownloadDir();
      fs.mkdirSync(downloadDir, { recursive: true });

      logger.info(`[downloader] Downloading: ${url} -> ${downloadDir}`);

      const sendProgress = (progress: DownloadProgress) => {
        sendToRenderer(C.progress, progress);
      };

      return new Promise<string>((resolve, reject) => {
        const outputTemplate = path.join(downloadDir, '%(title)s.%(ext)s');

        let hasFFmpeg = false;
        let ffmpegLocation: string | null = null;

        if (isFFmpegInstalled()) {
          hasFFmpeg = true;
          ffmpegLocation = getFFmpegDir();
          logger.info(`[downloader] Using managed ffmpeg from ${ffmpegLocation}`);
        } else {
          try {
            const { execFileSync: efs } = require('child_process');
            efs('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' });
            hasFFmpeg = true;
            logger.info('[downloader] Using system ffmpeg');
          } catch {
            logger.info('[downloader] ffmpeg not found, downloading best audio without conversion');
          }
        }

        const args: string[] = [];
        if (ffmpegLocation) {
          args.push('--ffmpeg-location', ffmpegLocation);
        }
        if (hasFFmpeg) {
          args.push(
            '-x',
            '--audio-format',
            'mp3',
            '--audio-quality',
            '0',
            '--embed-thumbnail',
            '--add-metadata'
          );
        } else {
          args.push('-f', 'bestaudio', '--add-metadata');
        }
        const tmpFile = path.join(os.tmpdir(), `shiranami-ytdlp-${randomUUID()}.txt`);

        args.push(
          '--no-warnings',
          '--newline',
          '--print-to-file',
          'after_move:filepath',
          tmpFile,
          '-o',
          outputTemplate,
          url
        );

        const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });

        let allOutput = '';
        let downloadedFilePath = '';

        proc.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          allOutput += text;

          const progressMatch = text.match(/\[download\]\s+([\d.]+)%/);
          if (progressMatch) {
            const pct = parseFloat(progressMatch[1]);
            sendProgress({ url, progress: pct, status: 'downloading' });
          }

          if (text.includes('[ExtractAudio]') || text.includes('[Merger]')) {
            sendProgress({ url, progress: 100, status: 'converting' });
          }
        });

        proc.stderr.on('data', (data: Buffer) => {
          allOutput += data.toString();
        });

        proc.on('error', err => {
          fs.promises.unlink(tmpFile).catch(() => {});
          sendProgress({ url, progress: 0, status: 'error', error: err.message });
          reject(err);
        });

        proc.on('close', code => {
          void (async () => {
            try {
              if (code !== 0) {
                const reason = classifyYtDlpFailure(allOutput);
                logger.error(
                  `[downloader] yt-dlp download failed for ${url} (exit ${code}): ${reason}`,
                  { outputTail: tailOutput(allOutput) }
                );
                sendProgress({ url, progress: 0, status: 'error', error: reason });
                reject(new Error(reason));
                return;
              }

              try {
                const raw = await fs.promises.readFile(tmpFile, 'utf8');
                // --print-to-file appends a line per emitted filepath; take the last non-empty one.
                const lines = raw
                  .split('\n')
                  .map(line => line.trim())
                  .filter(Boolean);
                downloadedFilePath = lines[lines.length - 1] ?? '';
                if (downloadedFilePath) {
                  await fs.promises.access(downloadedFilePath);
                }
              } catch {
                const errMsg = 'Could not determine downloaded file path';
                sendProgress({ url, progress: 0, status: 'error', error: errMsg });
                reject(new Error(errMsg));
                return;
              }

              if (!downloadedFilePath) {
                const errMsg = 'Could not determine downloaded file path';
                sendProgress({ url, progress: 0, status: 'error', error: errMsg });
                reject(new Error(errMsg));
                return;
              }

              logger.info(`[downloader] Downloaded: ${downloadedFilePath}`);
              sendProgress({ url, progress: 100, status: 'done' });
              resolve(downloadedFilePath);
            } catch (unexpected) {
              reject(unexpected instanceof Error ? unexpected : new Error(String(unexpected)));
            } finally {
              fs.promises.unlink(tmpFile).catch(() => {});
            }
          })();
        });
      });
    },
    { schema: downloaderDownloadArgs }
  );

  handle(
    C.getStreamUrl,
    async (_event, url: string) => {
      logger.info(`[downloader] Getting stream URL for: ${url}`);
      const { stdout, stderr, code } = await spawnYtDlp([
        '-f',
        'bestaudio',
        '--get-url',
        '--no-warnings',
        url,
      ]);

      if (code !== 0) {
        const reason = classifyYtDlpFailure(`${stderr}\n${stdout}`);
        logger.error(
          `[downloader] yt-dlp failed to extract stream URL for ${url} (exit ${code}): ${reason}`,
          { stderrTail: tailOutput(stderr) }
        );
        throw new IpcError(reason, reason);
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
  ipcMain.removeHandler(C.getStreamUrl);
  ipcMain.removeHandler(C.installYtdlp);
  ipcMain.removeHandler(C.getYtdlpPath);
  ipcMain.removeHandler(C.checkFfmpeg);
  ipcMain.removeHandler(C.installFfmpeg);
  ipcMain.removeHandler(C.installDependencies);
}
