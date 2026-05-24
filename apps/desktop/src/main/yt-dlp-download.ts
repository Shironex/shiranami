import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { logger } from './logger';
import { getYtDlpPath } from './ytdlp-manager';
import { getFFmpegDir, isFFmpegInstalled } from './ffmpeg-manager';
import { classifyYtDlpFailure, tailOutput, appendUrlArg } from './utils/ytdlp-spawn';

export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
}

export interface RunYtDlpDownloadOptions {
  url: string;
  downloadDir: string;
}

/**
 * Spawns yt-dlp to download `url` into `downloadDir` and resolves with the
 * downloaded file path. `onProgress` receives the same progress events the IPC
 * handler streams to the renderer. The spawn lifecycle, abort/error handling,
 * and temp-file readback are preserved exactly as the original handler had them.
 */
export function runYtDlpDownload(
  { url, downloadDir }: RunYtDlpDownloadOptions,
  onProgress: (progress: DownloadProgress) => void
): Promise<string> {
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

    // `--ignore-config` prevents yt-dlp from reading an ambient yt-dlp.conf that
    // could inject dangerous options (e.g. --exec). Keep it first.
    const args: string[] = ['--ignore-config'];
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
      outputTemplate
    );

    // appendUrlArg validates the http(s) scheme and inserts the `--`
    // end-of-options separator so `url` can never be parsed as a yt-dlp flag.
    const proc = spawn(getYtDlpPath(), appendUrlArg(args, url), {
      env: { ...process.env },
    });

    let allOutput = '';
    let downloadedFilePath = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      allOutput += text;

      const progressMatch = text.match(/\[download\]\s+([\d.]+)%/);
      if (progressMatch) {
        const pct = parseFloat(progressMatch[1]);
        onProgress({ url, progress: pct, status: 'downloading' });
      }

      if (text.includes('[ExtractAudio]') || text.includes('[Merger]')) {
        onProgress({ url, progress: 100, status: 'converting' });
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      allOutput += data.toString();
    });

    proc.on('error', err => {
      fs.promises.unlink(tmpFile).catch(() => {});
      onProgress({ url, progress: 0, status: 'error', error: err.message });
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
            onProgress({ url, progress: 0, status: 'error', error: reason });
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
            onProgress({ url, progress: 0, status: 'error', error: errMsg });
            reject(new Error(errMsg));
            return;
          }

          if (!downloadedFilePath) {
            const errMsg = 'Could not determine downloaded file path';
            onProgress({ url, progress: 0, status: 'error', error: errMsg });
            reject(new Error(errMsg));
            return;
          }

          logger.info(`[downloader] Downloaded: ${downloadedFilePath}`);
          onProgress({ url, progress: 100, status: 'done' });
          resolve(downloadedFilePath);
        } catch (unexpected) {
          reject(unexpected instanceof Error ? unexpected : new Error(String(unexpected)));
        } finally {
          fs.promises.unlink(tmpFile).catch(() => {});
        }
      })();
    });
  });
}
