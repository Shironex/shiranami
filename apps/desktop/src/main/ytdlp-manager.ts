import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { logger } from './logger';
import { requestJson } from './http';
import { getBinDir } from './utils/bin-paths';
import { downloadFile } from './utils/net-download';

const GITHUB_RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const GITHUB_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

interface GithubLatestReleaseResponse {
  tag_name?: string;
}

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

export function getYtDlpPath(): string {
  return path.join(getBinDir(), getBinaryName());
}

export function isYtDlpInstalled(): boolean {
  const binPath = getYtDlpPath();
  return fs.existsSync(binPath);
}

export async function getYtDlpVersion(): Promise<string | null> {
  if (!isYtDlpInstalled()) return null;
  try {
    return new Promise((resolve) => {
      const child = execFile(
        getYtDlpPath(),
        ['--version'],
        { timeout: 30000 },
        (err, stdout) => {
          if (err) {
            logger.error('[ytdlp-manager] Failed to get version:', err.message);
            resolve(null);
          } else {
            resolve(stdout.trim());
          }
        }
      );
      // Safety: kill if process hangs
      child.on('error', () => resolve(null));
    });
  } catch (err) {
    logger.error('[ytdlp-manager] Failed to get version:', err);
    return null;
  }
}

export async function getLatestYtDlpVersion(): Promise<string | null> {
  try {
    const release = await requestJson<GithubLatestReleaseResponse>(GITHUB_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Shiranami',
      },
    });
    return release.tag_name?.trim() || null;
  } catch (err) {
    logger.error('[ytdlp-manager] Failed to get latest release version:', err);
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
        execFileSync('xattr', ['-d', 'com.apple.quarantine', binPath], { timeout: 5000 });
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

