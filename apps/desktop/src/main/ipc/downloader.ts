import { ipcMain, app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logger';

export interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
}

export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}

function getDownloadDir(): string {
  const musicDir = app.getPath('music');
  const downloadDir = path.join(musicDir, 'Shiranami Downloads');
  fs.mkdirSync(downloadDir, { recursive: true });
  return downloadDir;
}

function spawnYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { env: { ...process.env } });
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

export function registerDownloaderHandlers(): void {
  // Check if yt-dlp is installed
  ipcMain.handle('downloader:check', async () => {
    try {
      const { stdout, code } = await spawnYtDlp(['--version']);
      if (code === 0) {
        return { installed: true, version: stdout.trim() };
      }
      return { installed: false };
    } catch {
      return { installed: false };
    }
  });

  // Search YouTube for music
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

      // Each line is a separate JSON object
      const results: SearchResult[] = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            const data = JSON.parse(line);
            return {
              id: data.id ?? '',
              title: data.title ?? 'Unknown',
              uploader: data.uploader ?? data.channel ?? 'Unknown',
              duration: data.duration ?? 0,
              thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
              url: data.url ?? `https://www.youtube.com/watch?v=${data.id}`,
              webpage_url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
            } satisfies SearchResult;
          } catch {
            return null;
          }
        })
        .filter((r): r is SearchResult => r !== null);

      logger.info(`[downloader] Found ${results.length} results`);
      return results;
    } catch (err) {
      logger.error('[downloader] Search error:', err);
      throw err;
    }
  });

  // Download a video as audio
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

        const proc = spawn('yt-dlp', [
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--embed-thumbnail',
          '--add-metadata',
          '--no-warnings',
          '--newline',
          '--print', 'after_move:filepath',
          '-o', outputTemplate,
          url,
        ], { env: { ...process.env } });

        let allOutput = '';
        let downloadedFilePath = '';

        proc.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          allOutput += text;

          // Parse progress lines like: [download]  45.2% of 5.23MiB ...
          const progressMatch = text.match(/\[download\]\s+([\d.]+)%/);
          if (progressMatch) {
            const pct = parseFloat(progressMatch[1]);
            sendProgress({ url, progress: pct, status: 'downloading' });
          }

          // Detect conversion phase
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

          // The last non-empty line of stdout should be the filepath from --print
          const lines = allOutput.trim().split('\n').filter(Boolean);
          // Find the filepath output (the line printed by --print after_move:filepath)
          // It's the last line that looks like a file path (not a yt-dlp progress line)
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line && !line.startsWith('[') && !line.startsWith('Deleting')) {
              downloadedFilePath = line;
              break;
            }
          }

          if (!downloadedFilePath) {
            // Fallback: look for .mp3 files in the output directory
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
}

export function cleanupDownloaderHandlers(): void {
  ipcMain.removeHandler('downloader:check');
  ipcMain.removeHandler('downloader:search');
  ipcMain.removeHandler('downloader:download');
}
