import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Worker } from 'node:worker_threads';
import { logger } from './logger';
import { requestJson, requestText } from './http';
import { getBinDir } from './utils/bin-paths';
import { downloadFile } from './utils/net-download';

const FFMPEG_WINDOWS_VERSION_URL =
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.ver';
const FFMPEG_MAC_INFO_URL = 'https://evermeet.cx/ffmpeg/info/ffmpeg/release';

interface EvermeetReleaseResponse {
  version?: string;
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

export async function getLatestFFmpegVersion(): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      const info = await requestJson<EvermeetReleaseResponse>(FFMPEG_MAC_INFO_URL);
      return info.version?.trim() || null;
    }

    if (process.platform === 'win32') {
      const version = await requestText(FFMPEG_WINDOWS_VERSION_URL);
      return version.trim() || null;
    }

    return null;
  } catch (err) {
    logger.error('[ffmpeg-manager] Failed to get latest release version:', err);
    return null;
  }
}

export async function downloadFFmpeg(
  onProgress?: (percent: number) => void
): Promise<void> {
  const binDir = getBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  if (process.platform === 'darwin') {
    await downloadFFmpegMac(binDir, onProgress);
  } else if (process.platform === 'win32') {
    await downloadFFmpegWin(binDir, onProgress);
  } else {
    throw new Error('Automatic ffmpeg download is only supported on macOS and Windows');
  }
}

async function downloadFFmpegMac(
  binDir: string,
  onProgress?: (percent: number) => void
): Promise<void> {
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
    execFileSync('unzip', ['-o', ffmpegZipPath, '-d', binDir], { timeout: 30000 });
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
    execFileSync('unzip', ['-o', ffprobeZipPath, '-d', binDir], { timeout: 30000 });
    fs.unlinkSync(ffprobeZipPath);
    onProgress?.(98);

    // Make executable and remove quarantine
    const ffmpegBin = getFFmpegPath();
    const ffprobeBin = getFFprobePath();
    fs.chmodSync(ffmpegBin, 0o755);
    fs.chmodSync(ffprobeBin, 0o755);
    try {
      execFileSync('xattr', ['-d', 'com.apple.quarantine', ffmpegBin], { timeout: 5000 });
      execFileSync('xattr', ['-d', 'com.apple.quarantine', ffprobeBin], { timeout: 5000 });
      logger.info('[ffmpeg-manager] Removed quarantine attributes');
    } catch {
      // xattr may fail if attribute doesn't exist
    }

    onProgress?.(100);
    logger.info(`[ffmpeg-manager] ffmpeg and ffprobe installed to ${binDir}`);
  } catch (err) {
    for (const zipPath of [ffmpegZipPath, ffprobeZipPath]) {
      try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    }
    throw err;
  }
}

/**
 * Resolve the path to the extract-worker script.
 * In production it lives next to the bundled main process code inside the asar;
 * in dev it's in dist/main after esbuild compiles it.
 */
function getExtractWorkerPath(): string {
  if (app.isPackaged) {
    return path.join(__dirname, 'extract-worker.js');
  }
  return path.join(app.getAppPath(), 'dist', 'main', 'extract-worker.js');
}

/**
 * Extract a zip file on Windows using a worker thread (non-blocking).
 * The worker tries 3 methods: adm-zip → tar → PowerShell.
 */
function extractZipWin(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const workerPath = getExtractWorkerPath();
    logger.info(`[ffmpeg-manager] Spawning extract worker: ${workerPath}`);

    let settled = false;
    const safeResolve = () => { if (!settled) { settled = true; resolve(); } };
    const safeReject = (err: Error) => { if (!settled) { settled = true; reject(err); } };

    const worker = new Worker(workerPath, {
      workerData: { zipPath, destDir },
    });

    worker.on('message', (msg: { success: boolean; method?: string; error?: string }) => {
      if (msg.success) {
        logger.info(`[ffmpeg-manager] Extraction succeeded via ${msg.method}`);
        safeResolve();
      } else {
        safeReject(new Error(msg.error ?? 'Extraction failed in worker'));
      }
    });

    worker.on('error', (err: Error) => {
      logger.error('[ffmpeg-manager] Extract worker error:', err);
      safeReject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        safeReject(new Error(`Extract worker exited with code ${code}`));
      }
    });
  });
}

async function downloadFFmpegWin(
  binDir: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  // Download from gyan.dev essentials build (stable redirect URL)
  const zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
  const zipPath = path.join(binDir, 'ffmpeg-essentials.zip');
  const extractDir = path.join(binDir, '_ffmpeg_extract');

  try {
    // Download zip (0-90%)
    logger.info(`[ffmpeg-manager] Downloading ffmpeg from ${zipUrl}`);
    await downloadFile(zipUrl, zipPath, (pct) => {
      onProgress?.(Math.round(pct * 0.9));
    });

    // Extract zip with 3-tier fallback: Node.js → tar → PowerShell
    onProgress?.(92);
    logger.info('[ffmpeg-manager] Extracting ffmpeg...');
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZipWin(zipPath, extractDir);
    fs.unlinkSync(zipPath);

    // Find ffmpeg.exe and ffprobe.exe inside the extracted directory
    // Structure: ffmpeg-N.N-essentials_build/bin/ffmpeg.exe
    onProgress?.(96);
    const ffmpegExe = findFileRecursive(extractDir, 'ffmpeg.exe');
    const ffprobeExe = findFileRecursive(extractDir, 'ffprobe.exe');

    if (!ffmpegExe || !ffprobeExe) {
      throw new Error('Could not find ffmpeg.exe or ffprobe.exe in downloaded archive');
    }

    // Move binaries to bin dir
    fs.copyFileSync(ffmpegExe, getFFmpegPath());
    fs.copyFileSync(ffprobeExe, getFFprobePath());

    // Clean up extracted directory
    fs.rmSync(extractDir, { recursive: true, force: true });

    onProgress?.(100);
    logger.info(`[ffmpeg-manager] ffmpeg and ffprobe installed to ${binDir}`);
  } catch (err) {
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw err;
  }
}

function findFileRecursive(dir: string, filename: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, filename);
      if (found) return found;
    }
  }
  return null;
}

