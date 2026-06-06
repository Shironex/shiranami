import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS, type DiskUsageResult, type VolumeUsage } from '@shiranami/contracts';
import { logger } from '../logger';
import { handle } from './with-ipc-handler';
import { getUsageArgs } from './schemas/storage';

const C = IPC_CHANNELS.storage;

// Bound the recursive walk so a pathological tree (or symlink cycle, though
// symlinks are skipped — see below) can't run away. Deep enough for any real
// Artist/Album/Disc layout.
const WALK_MAX_DEPTH = 12;
// Cap concurrent `stat` calls per directory, mirroring `library.ts`'s
// VALIDATE_CONCURRENCY so a huge flat folder doesn't open thousands of FDs.
const STAT_CONCURRENCY = 128;

/**
 * Stable per-volume bucket key. Two folders that share a key live on the same
 * physical volume and therefore share one disk-usage bar.
 *  - POSIX (macOS/Linux): the device id from `stat()` is the reliable signal.
 *  - Windows: `dev` is unreliable, so group by drive/mount root (`C:\`, or the
 *    `\\server\share` prefix for UNC paths) instead.
 */
export function volumeKeyFor(folderPath: string, dev: number): string {
  // `path.win32.parse` (not `path.parse`) so the drive-root grouping is correct
  // even when this runs under test on a POSIX host; at runtime on Windows the
  // two are identical.
  return process.platform === 'win32' ? path.win32.parse(folderPath).root : String(dev);
}

/**
 * Best-effort friendly label for a volume derived from one of its folder paths.
 *  - Windows: the drive letter without the trailing separator (`C:`).
 *  - macOS: the volume name for `/Volumes/<name>`; `/` falls back to the root.
 * Deriving the real internal-disk name ("Macintosh HD") needs a privileged
 * lookup, so the root path is an acceptable v1 fallback.
 */
export function mountLabelFor(folderPath: string): string {
  if (process.platform === 'win32') {
    const root = path.win32.parse(folderPath).root; // e.g. "C:\\" or "\\\\server\\share\\"
    return root.replace(/[\\/]+$/, '') || root;
  }
  const external = folderPath.match(/^\/Volumes\/([^/]+)/);
  if (external) return external[1];
  return '/';
}

/**
 * Sum the logical sizes (`stat.size`) of every regular file under `dirPath`,
 * streaming the total rather than collecting a path array first. Files are
 * `stat`-ed in bounded batches; subdirectories recurse sequentially so total
 * concurrency stays capped at `STAT_CONCURRENCY`.
 *
 * Resilience mirrors `library.ts`: an unreadable directory or a deleted/locked
 * file is swallowed (contributes 0) so one bad entry can't sink the total.
 *
 * The total is best-effort by design: symlinks are skipped entirely
 * (`entry.isDirectory()`/`isFile()` are both false for them — avoids cycles and
 * double-counting), anything below `WALK_MAX_DEPTH` is truncated, and on the
 * rare filesystem where `readdir` returns `DT_UNKNOWN` (no dirent `d_type`)
 * such entries are skipped too. macOS APFS and Windows NTFS — the only targets —
 * always populate `d_type`, so the usage bar is accurate there.
 */
export async function sumDirectorySize(
  dirPath: string,
  maxDepth = WALK_MAX_DEPTH,
  depth = 0
): Promise<number> {
  if (depth > maxDepth) return 0;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    logger.warn('[storage] Failed to read directory:', dirPath, error);
    return 0;
  }

  const files: string[] = [];
  const subdirs: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) subdirs.push(fullPath);
    else if (entry.isFile()) files.push(fullPath);
  }

  let total = 0;
  for (let i = 0; i < files.length; i += STAT_CONCURRENCY) {
    const batch = files.slice(i, i + STAT_CONCURRENCY);
    const sizes = await Promise.all(
      batch.map(async filePath => {
        try {
          const stat = await fs.promises.stat(filePath);
          return stat.size;
        } catch {
          return 0;
        }
      })
    );
    for (const size of sizes) total += size;
  }

  for (const subdir of subdirs) {
    total += await sumDirectorySize(subdir, maxDepth, depth + 1);
  }

  return total;
}

interface VolumeBucket {
  volumeKey: string;
  mountLabel: string;
  folderPaths: string[];
  /** Folder used to probe the volume (`statfs`); all folders share the disk. */
  samplePath: string;
}

/**
 * Bucket the given folder paths by physical volume, then for each volume read
 * its capacity (`statfs`) and sum the music bytes across its folders. A folder
 * whose root can't be `stat`-ed (unmounted/removed drive, unreadable root) and a
 * volume whose `statfs` throws are both reported as `unavailable: true` instead
 * of failing the whole call.
 */
export async function computeDiskUsage(folderPaths: string[]): Promise<DiskUsageResult> {
  const uniquePaths = Array.from(new Set(folderPaths.filter(p => p.length > 0)));

  const buckets = new Map<string, VolumeBucket>();
  const unavailableVolumes: VolumeUsage[] = [];

  for (const folderPath of uniquePaths) {
    let dev: number;
    try {
      const stat = await fs.promises.stat(folderPath);
      dev = stat.dev;
    } catch (error) {
      // Folder root unreadable / drive removed — its own unavailable entry.
      logger.warn('[storage] Folder root stat failed (unavailable):', folderPath, error);
      unavailableVolumes.push({
        volumeKey: `unavailable:${folderPath}`,
        mountLabel: mountLabelFor(folderPath),
        folderPaths: [folderPath],
        musicBytes: 0,
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0,
        unavailable: true,
      });
      continue;
    }

    const volumeKey = volumeKeyFor(folderPath, dev);
    const existing = buckets.get(volumeKey);
    if (existing) {
      existing.folderPaths.push(folderPath);
    } else {
      buckets.set(volumeKey, {
        volumeKey,
        mountLabel: mountLabelFor(folderPath),
        folderPaths: [folderPath],
        samplePath: folderPath,
      });
    }
  }

  const volumes: VolumeUsage[] = [];
  for (const bucket of buckets.values()) {
    let statfs: fs.StatsFs;
    try {
      statfs = await fs.promises.statfs(bucket.samplePath);
    } catch (error) {
      logger.warn('[storage] statfs failed (unavailable):', bucket.samplePath, error);
      volumes.push({
        volumeKey: bucket.volumeKey,
        mountLabel: bucket.mountLabel,
        folderPaths: bucket.folderPaths,
        musicBytes: 0,
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0,
        unavailable: true,
      });
      continue;
    }

    const bsize = statfs.bsize;
    const totalBytes = statfs.blocks * bsize;
    const freeBytes = statfs.bavail * bsize; // bavail: user-available (quota/root aware)
    const usedBytes = (statfs.blocks - statfs.bfree) * bsize;

    let musicBytes = 0;
    for (const folderPath of bucket.folderPaths) {
      musicBytes += await sumDirectorySize(folderPath);
    }

    volumes.push({
      volumeKey: bucket.volumeKey,
      mountLabel: bucket.mountLabel,
      folderPaths: bucket.folderPaths,
      musicBytes,
      totalBytes,
      freeBytes,
      usedBytes,
    });
  }

  return {
    volumes: [...volumes, ...unavailableVolumes],
    computedAt: new Date().toISOString(),
  };
}

export function registerStorageHandlers(): void {
  handle(
    C.getUsage,
    async (_event, requestedPaths: string[]): Promise<DiskUsageResult> => {
      return computeDiskUsage(requestedPaths);
    },
    { schema: getUsageArgs }
  );
}

export function cleanupStorageHandlers(): void {
  ipcMain.removeHandler(C.getUsage);
}
