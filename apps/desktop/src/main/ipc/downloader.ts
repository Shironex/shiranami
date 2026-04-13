import { ipcMain, app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
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

export interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
  view_count?: number;
}

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

interface DownloadLocationState {
  path: string;
  defaultPath: string;
  isDefault: boolean;
}

const DOWNLOAD_LOCATION_STORE_KEY = 'downloads.location';
const TOOL_STATUS_CACHE_KEY = 'downloads.toolStatusCache';

interface ToolStatusCache {
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
    const persisted = store.get(TOOL_STATUS_CACHE_KEY) as ToolStatusCache | undefined;
    if (persisted && typeof persisted.timestamp === 'number') {
      toolStatusCache = persisted;
      logger.info(`[downloader] Loaded tool status from persistent cache (age: ${Date.now() - persisted.timestamp}ms)`);
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
  logger.info(`[downloader] Tool status refreshed — yt-dlp: ${ytdlp.installed ? 'installed' : 'missing'}, ffmpeg: ${ffmpeg.installed ? 'installed' : 'missing'}`);
  return cache;
}

function invalidateToolStatusCache(): void {
  toolStatusCache = null;
  store.delete(TOOL_STATUS_CACHE_KEY);
  logger.info('[downloader] Tool status cache invalidated');
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
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

function getDownloadLocationState(): DownloadLocationState {
  const defaultPath = getDefaultDownloadDir();
  const selectedPath = getStoredDownloadDir() ?? defaultPath;
  return {
    path: ensureDownloadDir(selectedPath),
    defaultPath,
    isDefault: path.normalize(selectedPath) === path.normalize(defaultPath),
  };
}

function spawnYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', (err) => {
      reject(err);
    });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/**
 * Extract the last N non-empty lines from mixed yt-dlp/ffmpeg output, capped
 * to ~2KB. Used to build concise error messages — some yt-dlp failures (e.g.
 * format enumeration) can emit hundreds of lines we don't want in the log.
 */
export function tailOutput(output: string, maxLines = 20, maxBytes = 2048): string {
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const tail = lines.slice(-maxLines).join('\n');
  return tail.length > maxBytes ? tail.slice(-maxBytes) : tail;
}

/**
 * Stable error codes returned by classifyYtDlpFailure for known failure
 * modes. The renderer maps these to i18n strings (EN + PL) — see
 * apps/web/src/lib/ytdlpErrors.ts. Unknown failures return the raw tail
 * of yt-dlp/ffmpeg output, which is technical English from the tool itself.
 *
 * When adding a new code here, add a matching translation entry in
 * toast.json (both locales) and map it in translateYtDlpError().
 */
export const YT_DLP_ERROR_CODES = {
  AGE_RESTRICTED: 'yt_dlp_age_restricted',
  VIDEO_UNAVAILABLE: 'yt_dlp_video_unavailable',
  NO_AUDIO_FORMAT: 'yt_dlp_no_audio_format',
} as const;

/**
 * Classify a yt-dlp failure from its captured stdout+stderr and return a
 * stable error code (translated in the renderer) or a raw output tail for
 * unknown cases. Age-restriction is the #1 cause of per-video failures in
 * 2026 — YouTube will not hand out stream URLs or formats without sign-in
 * cookies for videos flagged by the content classifier. The proper fix
 * (browser cookie import) is tracked as a follow-up issue; here we only
 * surface a clear, translated message.
 */
export function classifyYtDlpFailure(output: string): string {
  const text = output.toLowerCase();

  if (
    text.includes('sign in to confirm your age') ||
    text.includes('login_required') ||
    text.includes('age-restricted')
  ) {
    return YT_DLP_ERROR_CODES.AGE_RESTRICTED;
  }

  if (text.includes('video unavailable') || text.includes('unplayable')) {
    return YT_DLP_ERROR_CODES.VIDEO_UNAVAILABLE;
  }

  if (text.includes('requested format is not available')) {
    return YT_DLP_ERROR_CODES.NO_AUDIO_FORMAT;
  }

  const tail = tailOutput(output);
  return tail || 'yt-dlp failed without producing any output';
}

export function extractVersionSegments(version: string | null | undefined): number[] {
  if (!version) return [];

  const match = version.match(/\d+(?:\.\d+)*/);
  if (!match) return [];

  return match[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

export function hasUpdate(currentVersion: string | null, latestVersion: string | null): boolean {
  const currentSegments = extractVersionSegments(currentVersion);
  const latestSegments = extractVersionSegments(latestVersion);

  if (currentSegments.length === 0 || latestSegments.length === 0) {
    return false;
  }

  const maxLength = Math.max(currentSegments.length, latestSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const current = currentSegments[index] ?? 0;
    const latest = latestSegments[index] ?? 0;

    if (latest > current) return true;
    if (latest < current) return false;
  }

  return false;
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
  ipcMain.handle('downloader:get-download-location', async () => {
    return getDownloadLocationState();
  });

  ipcMain.handle('downloader:set-download-location', async (_event, downloadDir: string | null) => {
    const defaultPath = getDefaultDownloadDir();

    if (typeof downloadDir !== 'string' || downloadDir.trim().length === 0) {
      store.delete(DOWNLOAD_LOCATION_STORE_KEY);
      return getDownloadLocationState();
    }

    const resolvedPath = ensureDownloadDir(path.resolve(downloadDir.trim()));
    if (path.normalize(resolvedPath) === path.normalize(defaultPath)) {
      store.delete(DOWNLOAD_LOCATION_STORE_KEY);
    } else {
      store.set(DOWNLOAD_LOCATION_STORE_KEY, resolvedPath);
    }

    return getDownloadLocationState();
  });

  ipcMain.handle('downloader:check-dependencies', async () => {
    return {
      ytdlpInstalled: isYtDlpInstalled(),
      ffmpegInstalled: isFFmpegInstalled(),
    };
  });

  ipcMain.handle('downloader:get-cached-tool-status', async () => {
    return loadCachedToolStatus();
  });

  handleWithFallback(
    'downloader:refresh-tool-status',
    () => fetchAndCacheToolStatus(),
    () => loadCachedToolStatus(),
  );

  handleWithFallback(
    'downloader:check',
    () => getYtDlpStatus(),
    () => ({ installed: isYtDlpInstalled() }) as BinaryStatus,
  );

  handle('downloader:search', async (_event, query: string) => {
    logger.info(`[downloader] Searching: ${query}`);
    const { stdout, code } = await spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch10:${query}`,
    ]);

    if (code !== 0) {
      throw new Error('yt-dlp search failed');
    }

    const results: SearchResult[] = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const data = JSON.parse(line);
          const result: SearchResult = {
            id: data.id ?? '',
            title: data.title ?? 'Unknown',
            uploader: data.uploader ?? data.channel ?? 'Unknown',
            duration: data.duration ?? 0,
            thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
            url: data.url ?? `https://www.youtube.com/watch?v=${data.id}`,
            webpage_url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
            view_count: typeof data.view_count === 'number' ? data.view_count : undefined,
          };
          return result;
        } catch (err) {
          logger.debug('[downloader] Failed to parse search result JSON:', err);
          return null;
        }
      })
      .filter((result): result is SearchResult => result !== null);

    logger.info(`[downloader] Found ${results.length} results`);
    return results;
  });

  handleWithFallback(
    'downloader:suggest',
    async (_event, query: string) => {
      const url = `https://clients1.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
      const data = await requestJson<[string, string[]]>(url);
      return Array.isArray(data[1]) ? data[1] : [];
    },
    () => [] as string[],
  );

  ipcMain.handle(
    'downloader:download',
    async (_event, opts: { url: string; outputDir?: string }) => {
      const { url, outputDir } = opts;
      const downloadDir = outputDir ?? getDownloadDir();
      fs.mkdirSync(downloadDir, { recursive: true });

      logger.info(`[downloader] Downloading: ${url} -> ${downloadDir}`);

      const mainWindow = getMainWindow();

      const sendProgress = (progress: DownloadProgress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloader:progress', progress);
        }
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
        args.push(
          '--no-warnings',
          '--newline',
          '--print',
          'after_move:filepath',
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

        proc.on('error', (err) => {
          sendProgress({ url, progress: 0, status: 'error', error: err.message });
          reject(err);
        });

        proc.on('close', (code) => {
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

          const lines = allOutput.trim().split('\n').filter(Boolean);
          for (let index = lines.length - 1; index >= 0; index -= 1) {
            const line = lines[index].trim();
            if (line && !line.startsWith('[') && !line.startsWith('Deleting')) {
              downloadedFilePath = line;
              break;
            }
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
        });
      });
    }
  );

  handle('downloader:get-stream-url', async (_event, url: string) => {
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
  });

  ipcMain.handle('downloader:install-ytdlp', async () => {
    try {
      const mainWindow = getMainWindow();
      await downloadYtDlp((percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloader:install-progress', { percent });
        }
      });
      invalidateToolStatusCache();
    } catch (err) {
      logger.error('[downloader] Failed to install yt-dlp:', err);
      throw new IpcError(
        'downloader.install_failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  ipcMain.handle('downloader:get-ytdlp-path', async () => {
    return getYtDlpPath();
  });

  handleWithFallback(
    'downloader:check-ffmpeg',
    () => getFFmpegStatus(),
    () => ({ installed: isFFmpegInstalled() }) as BinaryStatus,
  );

  ipcMain.handle('downloader:install-ffmpeg', async () => {
    try {
      const mainWindow = getMainWindow();
      await downloadFFmpeg((percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloader:ffmpeg-install-progress', { percent });
        }
      });
      invalidateToolStatusCache();
    } catch (err) {
      logger.error('[downloader] Failed to install ffmpeg:', err);
      throw new IpcError(
        'downloader.install_failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  ipcMain.handle('downloader:install-dependencies', async () => {
    const mainWindow = getMainWindow();
    const targets: Array<'ytdlp' | 'ffmpeg'> = [];

    if (!isYtDlpInstalled()) {
      targets.push('ytdlp');
    }
    if (!isFFmpegInstalled()) {
      targets.push('ffmpeg');
    }

    if (targets.length === 0) {
      return;
    }

    const stepWeight = 100 / targets.length;
    const sendProgress = (progress: DependencyInstallProgress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('downloader:dependency-install-progress', progress);
      }
    };

    try {
      for (const [index, target] of targets.entries()) {
        const offset = index * stepWeight;

        if (target === 'ytdlp') {
          await downloadYtDlp((percent) => {
            sendProgress({
              target,
              percent,
              overallPercent: Math.min(
                100,
                Math.round(offset + (percent / 100) * stepWeight)
              ),
              label:
                targets.length > 1
                  ? `Installing yt-dlp (${index + 1}/${targets.length})`
                  : 'Installing yt-dlp',
            });
          });
          continue;
        }

        await downloadFFmpeg((percent) => {
          sendProgress({
            target,
            percent,
            overallPercent: Math.min(
              100,
              Math.round(offset + (percent / 100) * stepWeight)
            ),
            label:
              targets.length > 1
                ? `Installing ffmpeg (${index + 1}/${targets.length})`
                : 'Installing ffmpeg',
          });
        });
      }

      invalidateToolStatusCache();
    } catch (err) {
      logger.error('[downloader] Failed to install dependencies:', err);
      throw new IpcError(
        'downloader.install_failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  // Background refresh on startup — populate cache silently
  fetchAndCacheToolStatus().catch((err) => {
    logger.warn('[downloader] Background tool status refresh failed:', err);
  });
}

export function cleanupDownloaderHandlers(): void {
  ipcMain.removeHandler('downloader:get-download-location');
  ipcMain.removeHandler('downloader:set-download-location');
  ipcMain.removeHandler('downloader:check-dependencies');
  ipcMain.removeHandler('downloader:get-cached-tool-status');
  ipcMain.removeHandler('downloader:refresh-tool-status');
  ipcMain.removeHandler('downloader:check');
  ipcMain.removeHandler('downloader:search');
  ipcMain.removeHandler('downloader:download');
  ipcMain.removeHandler('downloader:get-stream-url');
  ipcMain.removeHandler('downloader:install-ytdlp');
  ipcMain.removeHandler('downloader:get-ytdlp-path');
  ipcMain.removeHandler('downloader:check-ffmpeg');
  ipcMain.removeHandler('downloader:install-ffmpeg');
  ipcMain.removeHandler('downloader:install-dependencies');
}
