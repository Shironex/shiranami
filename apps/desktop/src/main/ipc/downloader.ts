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

  ipcMain.handle('downloader:check', async () => {
    try {
      return await getYtDlpStatus();
    } catch {
      return { installed: isYtDlpInstalled() };
    }
  });

  ipcMain.handle('downloader:search', async (_event, query: string) => {
    logger.info(`[downloader] Searching: ${query}`);
    try {
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
          } catch {
            return null;
          }
        })
        .filter((result): result is SearchResult => result !== null);

      logger.info(`[downloader] Found ${results.length} results`);
      return results;
    } catch (err) {
      logger.error('[downloader] Search error:', err);
      throw err;
    }
  });

  ipcMain.handle('downloader:suggest', async (_event, query: string) => {
    try {
      const url = `https://clients1.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
      const data = await requestJson<[string, string[]]>(url);
      return Array.isArray(data[1]) ? data[1] : [];
    } catch (err) {
      logger.error('[downloader] Suggest error:', err);
      return [];
    }
  });

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
            const errMsg = `yt-dlp exited with code ${code}`;
            sendProgress({ url, progress: 0, status: 'error', error: errMsg });
            reject(new Error(errMsg));
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

  ipcMain.handle('downloader:get-stream-url', async (_event, url: string) => {
    logger.info(`[downloader] Getting stream URL for: ${url}`);
    try {
      const { stdout, code } = await spawnYtDlp([
        '-f',
        'bestaudio',
        '--get-url',
        '--no-warnings',
        url,
      ]);

      if (code !== 0) {
        throw new Error('yt-dlp failed to extract stream URL');
      }

      const streamUrl = stdout.trim().split('\n')[0];
      if (!streamUrl) {
        throw new Error('No stream URL returned');
      }

      logger.info(`[downloader] Got stream URL for: ${url}`);
      return streamUrl;
    } catch (err) {
      logger.error('[downloader] Stream URL extraction error:', err);
      throw err;
    }
  });

  ipcMain.handle('downloader:install-ytdlp', async () => {
    try {
      const mainWindow = getMainWindow();
      await downloadYtDlp((percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloader:install-progress', { percent });
        }
      });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      logger.error('[downloader] Failed to install yt-dlp:', err);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('downloader:get-ytdlp-path', async () => {
    return getYtDlpPath();
  });

  ipcMain.handle('downloader:check-ffmpeg', async () => {
    try {
      return await getFFmpegStatus();
    } catch {
      return { installed: isFFmpegInstalled() };
    }
  });

  ipcMain.handle('downloader:install-ffmpeg', async () => {
    try {
      const mainWindow = getMainWindow();
      await downloadFFmpeg((percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloader:ffmpeg-install-progress', { percent });
        }
      });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      logger.error('[downloader] Failed to install ffmpeg:', err);
      return { success: false, error: errorMessage };
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
      return { success: true };
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

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Dependency installation failed';
      logger.error('[downloader] Failed to install dependencies:', err);
      return { success: false, error: errorMessage };
    }
  });
}

export function cleanupDownloaderHandlers(): void {
  ipcMain.removeHandler('downloader:get-download-location');
  ipcMain.removeHandler('downloader:set-download-location');
  ipcMain.removeHandler('downloader:check-dependencies');
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
