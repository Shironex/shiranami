import { app, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, execSync } from 'child_process';
import { logger } from './logger';

const GITHUB_RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

function getAssetUrl(): string {
  switch (process.platform) {
    case 'darwin':
      return `${GITHUB_RELEASE_BASE}/yt-dlp_macos`;
    case 'win32':
      return `${GITHUB_RELEASE_BASE}/yt-dlp.exe`;
    default:
      return `${GITHUB_RELEASE_BASE}/yt-dlp_linux`;
  }
}

function getBinaryName(): string {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function getBinDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'bin');
  }
  // Dev mode: navigate from app path up to monorepo root
  // app.getAppPath() points to apps/desktop (or similar), walk up to monorepo root
  let dir = app.getAppPath();
  // Walk up until we find package.json with workspaces or hit root
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
  // Fallback to userData even in dev
  return path.join(app.getPath('userData'), 'bin');
}

export function getYtDlpPath(): string {
  return path.join(getBinDir(), getBinaryName());
}

export function isYtDlpInstalled(): boolean {
  const binPath = getYtDlpPath();
  return fs.existsSync(binPath);
}

export function getYtDlpVersion(): string | null {
  if (!isYtDlpInstalled()) return null;
  try {
    const output = execFileSync(getYtDlpPath(), ['--version'], {
      timeout: 5000,
      encoding: 'utf-8',
    });
    return output.trim();
  } catch (err) {
    logger.error('[ytdlp-manager] Failed to get version:', err);
    return null;
  }
}

export async function downloadYtDlp(
  onProgress?: (percent: number) => void
): Promise<void> {
  const binDir = getBinDir();
  const binPath = getYtDlpPath();
  const tmpPath = binPath + '.tmp';

  fs.mkdirSync(binDir, { recursive: true });

  const url = getAssetUrl();
  logger.info(`[ytdlp-manager] Downloading yt-dlp from ${url}`);

  // Clean up any previous partial download
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    // ignore if doesn't exist
  }

  try {
    await downloadFile(url, tmpPath, onProgress);

    // Make executable on non-Windows
    if (process.platform !== 'win32') {
      fs.chmodSync(tmpPath, 0o755);
    }

    // Atomic rename
    fs.renameSync(tmpPath, binPath);

    // Remove macOS quarantine attribute so Gatekeeper doesn't block execution
    if (process.platform === 'darwin') {
      try {
        execSync(`xattr -d com.apple.quarantine "${binPath}"`, { timeout: 5000 });
        logger.info('[ytdlp-manager] Removed quarantine attribute');
      } catch {
        // xattr may fail if attribute doesn't exist, that's fine
      }
    }

    logger.info(`[ytdlp-manager] yt-dlp downloaded to ${binPath}`);
  } catch (err) {
    // Clean up partial download
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = net.request(url);

    request.on('response', (response) => {
      // Follow redirects are handled automatically by net.request
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
