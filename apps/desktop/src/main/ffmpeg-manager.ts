import { app, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { logger } from './logger';

function getBinDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'bin');
  }
  // Dev mode: navigate from app path up to monorepo root
  let dir = app.getAppPath();
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces || pkg.name === 'shiranami') {
          return path.join(dir, 'bin');
        }
      } catch {
        // ignore parse errors
      }
    }
    dir = path.dirname(dir);
  }
  return path.join(app.getPath('userData'), 'bin');
}

export function getFFmpegDir(): string {
  return getBinDir();
}

export function getFFmpegPath(): string {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return path.join(getBinDir(), name);
}

export function getFFprobePath(): string {
  const name = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  return path.join(getBinDir(), name);
}

export function isFFmpegInstalled(): boolean {
  return fs.existsSync(getFFmpegPath()) && fs.existsSync(getFFprobePath());
}

export async function getFFmpegVersion(): Promise<string | null> {
  if (!isFFmpegInstalled()) return null;
  try {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      const child = execFile(
        getFFmpegPath(),
        ['-version'],
        { timeout: 10000 },
        (err, stdout) => {
          if (err) {
            logger.error('[ffmpeg-manager] Failed to get version:', err.message);
            resolve(null);
          } else {
            // Parse first line: "ffmpeg version N-xxxxx-g... Copyright ..."
            const firstLine = stdout.split('\n')[0] ?? '';
            const match = firstLine.match(/ffmpeg version\s+(\S+)/);
            resolve(match ? match[1] : firstLine.trim() || null);
          }
        }
      );
      child.on('error', () => resolve(null));
    });
  } catch (err) {
    logger.error('[ffmpeg-manager] Failed to get version:', err);
    return null;
  }
}

export async function downloadFFmpeg(
  onProgress?: (percent: number) => void
): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic ffmpeg download is currently only supported on macOS');
  }

  const binDir = getBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  // Download ffmpeg and ffprobe from evermeet.cx (macOS single-binary zips)
  const ffmpegUrl = 'https://evermeet.cx/ffmpeg/getrelease/zip';
  const ffprobeUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip';

  const ffmpegZipPath = path.join(binDir, 'ffmpeg.zip');
  const ffprobeZipPath = path.join(binDir, 'ffprobe.zip');

  try {
    // Download ffmpeg (0-45%)
    logger.info(`[ffmpeg-manager] Downloading ffmpeg from ${ffmpegUrl}`);
    await downloadFile(ffmpegUrl, ffmpegZipPath, (pct) => {
      onProgress?.(Math.round(pct * 0.45));
    });

    // Extract ffmpeg (45-50%)
    onProgress?.(46);
    logger.info('[ffmpeg-manager] Extracting ffmpeg...');
    execSync(`unzip -o "${ffmpegZipPath}" -d "${binDir}"`, { timeout: 30000 });
    fs.unlinkSync(ffmpegZipPath);
    onProgress?.(50);

    // Download ffprobe (50-95%)
    logger.info(`[ffmpeg-manager] Downloading ffprobe from ${ffprobeUrl}`);
    await downloadFile(ffprobeUrl, ffprobeZipPath, (pct) => {
      onProgress?.(50 + Math.round(pct * 0.45));
    });

    // Extract ffprobe (95-98%)
    onProgress?.(96);
    logger.info('[ffmpeg-manager] Extracting ffprobe...');
    execSync(`unzip -o "${ffprobeZipPath}" -d "${binDir}"`, { timeout: 30000 });
    fs.unlinkSync(ffprobeZipPath);
    onProgress?.(98);

    // Make executable and remove quarantine
    const ffmpegBin = getFFmpegPath();
    const ffprobeBin = getFFprobePath();

    fs.chmodSync(ffmpegBin, 0o755);
    fs.chmodSync(ffprobeBin, 0o755);

    try {
      execSync(`xattr -d com.apple.quarantine "${ffmpegBin}"`, { timeout: 5000 });
      execSync(`xattr -d com.apple.quarantine "${ffprobeBin}"`, { timeout: 5000 });
      logger.info('[ffmpeg-manager] Removed quarantine attributes');
    } catch {
      // xattr may fail if attribute doesn't exist
    }

    onProgress?.(100);
    logger.info(`[ffmpeg-manager] ffmpeg and ffprobe installed to ${binDir}`);
  } catch (err) {
    // Clean up partial downloads
    for (const zipPath of [ffmpegZipPath, ffprobeZipPath]) {
      try {
        fs.unlinkSync(zipPath);
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = net.request(url);

    request.on('response', (response) => {
      const statusCode = response.statusCode;

      if (statusCode < 200 || statusCode >= 300) {
        reject(new Error(`Download failed with status ${statusCode}`));
        return;
      }

      const contentLength = parseInt(
        response.headers['content-length'] as string,
        10
      );
      let downloaded = 0;

      const writeStream = fs.createWriteStream(destPath);

      response.on('data', (chunk: Buffer) => {
        writeStream.write(chunk);
        downloaded += chunk.length;
        if (contentLength > 0 && onProgress) {
          const percent = Math.min(
            100,
            Math.round((downloaded / contentLength) * 100)
          );
          onProgress(percent);
        }
      });

      response.on('end', () => {
        writeStream.end(() => {
          resolve();
        });
      });

      response.on('error', (err: Error) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('error', (err: Error) => {
        reject(err);
      });
    });

    request.on('error', (err: Error) => {
      reject(err);
    });

    request.end();
  });
}
