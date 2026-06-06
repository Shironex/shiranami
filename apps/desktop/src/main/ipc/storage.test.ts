import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { DiskUsageResult } from '@shiranami/contracts';
import { ipcHandlers, makeTempDir, cleanupTempDir } from '../../../test/setup';
import {
  registerStorageHandlers,
  cleanupStorageHandlers,
  volumeKeyFor,
  mountLabelFor,
  sumDirectorySize,
  computeDiskUsage,
} from './storage';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const event = null as never;

/** Temporarily force `process.platform` for a win32-branch assertion. */
function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

describe('volumeKeyFor', () => {
  it('uses the device id on POSIX', () => {
    withPlatform('darwin', () => {
      expect(volumeKeyFor('/Users/me/Music', 42)).toBe('42');
    });
  });

  it('uses the drive root on Windows', () => {
    withPlatform('win32', () => {
      expect(volumeKeyFor('C:\\Users\\me\\Music', 42)).toBe('C:\\');
      expect(volumeKeyFor('D:\\Audio', 7)).toBe('D:\\');
    });
  });

  it('normalizes Windows drive-root case so c:\\ and C:\\ bucket together', () => {
    withPlatform('win32', () => {
      expect(volumeKeyFor('c:\\Music', 1)).toBe(volumeKeyFor('C:\\Other', 2));
      expect(volumeKeyFor('c:\\Music', 1)).toBe('C:\\');
    });
  });
});

describe('mountLabelFor', () => {
  it('labels an external macOS volume by name and the root as "/"', () => {
    withPlatform('darwin', () => {
      expect(mountLabelFor('/Volumes/Samsung T7/Music')).toBe('Samsung T7');
      expect(mountLabelFor('/Users/me/Music')).toBe('/');
    });
  });

  it('labels a Windows volume by drive letter without the separator', () => {
    withPlatform('win32', () => {
      expect(mountLabelFor('C:\\Users\\me\\Music')).toBe('C:');
    });
  });
});

describe('sumDirectorySize', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  it('sums logical file sizes across nested directories', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.mp3'), Buffer.alloc(1000));
    fs.writeFileSync(path.join(tmpDir, 'cover.jpg'), Buffer.alloc(500)); // non-audio counts too
    const sub = path.join(tmpDir, 'album');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'b.flac'), Buffer.alloc(2000));
    const deep = path.join(sub, 'disc2');
    fs.mkdirSync(deep);
    fs.writeFileSync(path.join(deep, 'c.ogg'), Buffer.alloc(300));

    expect(await sumDirectorySize(tmpDir)).toBe(3800);
  });

  it('returns 0 for a non-existent directory (swallowed)', async () => {
    expect(await sumDirectorySize(path.join(tmpDir, 'nope'))).toBe(0);
  });

  it('returns 0 for an empty directory', async () => {
    expect(await sumDirectorySize(tmpDir)).toBe(0);
  });

  it('respects maxDepth', async () => {
    fs.writeFileSync(path.join(tmpDir, 'top.mp3'), Buffer.alloc(100));
    const sub = path.join(tmpDir, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'deep.mp3'), Buffer.alloc(100));

    // maxDepth 0 only reads the root level; the subdir's file is excluded.
    expect(await sumDirectorySize(tmpDir, 0)).toBe(100);
  });
});

describe('computeDiskUsage', () => {
  let dirA: string;
  let dirB: string;

  beforeEach(() => {
    dirA = makeTempDir();
    dirB = makeTempDir();
  });

  afterEach(() => {
    cleanupTempDir(dirA);
    cleanupTempDir(dirB);
  });

  it('reports one volume with accurate music bytes for a single folder', async () => {
    fs.writeFileSync(path.join(dirA, 'song.mp3'), Buffer.alloc(4096));

    const result = await computeDiskUsage([dirA]);

    expect(result.volumes).toHaveLength(1);
    const [volume] = result.volumes;
    expect(volume.folderPaths).toEqual([dirA]);
    expect(volume.musicBytes).toBe(4096);
    expect(volume.totalBytes).toBeGreaterThan(0);
    expect(volume.freeBytes).toBeGreaterThan(0);
    expect(volume.freeBytes).toBeLessThanOrEqual(volume.totalBytes);
    expect(volume.usedBytes).toBeGreaterThanOrEqual(0);
    expect(volume.unavailable).toBeUndefined();
    expect(typeof result.computedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.computedAt))).toBe(false);
  });

  it('merges folders on the same volume into one bucket and sums their bytes', async () => {
    // Two temp dirs both live under os.tmpdir() → same volume on the test host.
    fs.writeFileSync(path.join(dirA, 'a.mp3'), Buffer.alloc(1000));
    fs.writeFileSync(path.join(dirB, 'b.mp3'), Buffer.alloc(2000));

    const result = await computeDiskUsage([dirA, dirB]);

    expect(result.volumes).toHaveLength(1);
    const [volume] = result.volumes;
    expect(volume.folderPaths.sort()).toEqual([dirA, dirB].sort());
    expect(volume.musicBytes).toBe(3000);
  });

  it('dedupes duplicate folder paths', async () => {
    fs.writeFileSync(path.join(dirA, 'a.mp3'), Buffer.alloc(1500));

    const result = await computeDiskUsage([dirA, dirA]);

    expect(result.volumes).toHaveLength(1);
    expect(result.volumes[0].folderPaths).toEqual([dirA]);
    expect(result.volumes[0].musicBytes).toBe(1500); // counted once, not 3000
  });

  it('marks a removed/unreadable folder as unavailable without failing the call', async () => {
    fs.writeFileSync(path.join(dirA, 'a.mp3'), Buffer.alloc(1000));
    const missing = path.join(dirB, 'ejected-drive');

    const result = await computeDiskUsage([dirA, missing]);

    const available = result.volumes.find(v => !v.unavailable);
    const unavailable = result.volumes.find(v => v.unavailable);
    expect(available?.musicBytes).toBe(1000);
    expect(unavailable).toBeDefined();
    expect(unavailable?.folderPaths).toEqual([missing]);
    expect(unavailable?.totalBytes).toBe(0);
    expect(unavailable?.freeBytes).toBe(0);
  });

  it('returns no volumes for empty input', async () => {
    const result = await computeDiskUsage([]);
    expect(result.volumes).toEqual([]);
  });
});

describe('storage:get-usage handler', () => {
  let tmpDir: string;

  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    registerStorageHandlers();
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    cleanupStorageHandlers();
    cleanupTempDir(tmpDir);
  });

  it('is registered and returns a disk-usage result', async () => {
    fs.writeFileSync(path.join(tmpDir, 'song.mp3'), Buffer.alloc(2048));
    const handler = ipcHandlers.get('storage:get-usage')!;

    const result = (await handler(event, [tmpDir])) as DiskUsageResult;

    expect(result.volumes).toHaveLength(1);
    expect(result.volumes[0].musicBytes).toBe(2048);
  });

  it('rejects a non-array payload (zod tuple validation)', async () => {
    const handler = ipcHandlers.get('storage:get-usage')!;
    await expect(handler(event, 'not-an-array')).rejects.toBeTruthy();
  });

  it('cleanupStorageHandlers removes the handler', () => {
    expect(ipcHandlers.has('storage:get-usage')).toBe(true);
    cleanupStorageHandlers();
    expect(ipcHandlers.has('storage:get-usage')).toBe(false);
  });
});
