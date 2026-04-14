import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeTempDir, cleanupTempDir } from '../../test/setup';

const mockUserDataPath = '/mock/userData';

vi.mock('electron', async () => {
  const setup = await import('../../test/setup');
  return {
    ...setup,
    app: {
      isPackaged: true,
      getPath: vi.fn().mockReturnValue(mockUserDataPath),
      getAppPath: vi.fn().mockReturnValue('/mock/app'),
    },
    net: {
      request: vi.fn(),
    },
  };
});

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./http', () => ({
  requestJson: vi.fn(),
  requestText: vi.fn(),
}));

describe('ytdlp-manager', () => {
  describe('getYtDlpPath', () => {
    it('returns path with .exe on win32', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      vi.resetModules();
      const mod = await import('./ytdlp-manager');
      const result = mod.getYtDlpPath();

      expect(result).toContain('yt-dlp.exe');
      expect(result).toContain('bin');

      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    });

    it('returns path without .exe on darwin', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      vi.resetModules();
      const mod = await import('./ytdlp-manager');
      const result = mod.getYtDlpPath();

      expect(result).not.toContain('.exe');
      expect(result).toMatch(/yt-dlp$/);

      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    });
  });

  describe('isYtDlpInstalled', () => {
    it('returns true when binary exists', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return { ...actualFs, existsSync: vi.fn().mockReturnValue(true) };
      });

      const mod = await import('./ytdlp-manager');
      expect(mod.isYtDlpInstalled()).toBe(true);
    });

    it('returns false when binary is missing', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return { ...actualFs, existsSync: vi.fn().mockReturnValue(false) };
      });

      const mod = await import('./ytdlp-manager');
      expect(mod.isYtDlpInstalled()).toBe(false);
    });
  });

  describe('getYtDlpVersion', () => {
    it('returns null when binary is not installed', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return { ...actualFs, existsSync: vi.fn().mockReturnValue(false) };
      });

      const mod = await import('./ytdlp-manager');
      expect(await mod.getYtDlpVersion()).toBeNull();
    });

    it('executes binary and returns trimmed stdout when installed', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return { ...actualFs, existsSync: vi.fn().mockReturnValue(true) };
      });
      vi.doMock('child_process', () => ({
        execFile: vi.fn((_bin, _args, _opts, cb: (err: Error | null, stdout: string) => void) => {
          cb(null, '2024.01.01\n');
          return { on: vi.fn() };
        }),
        execSync: vi.fn(),
      }));

      const mod = await import('./ytdlp-manager');
      expect(await mod.getYtDlpVersion()).toBe('2024.01.01');
    });

    it('returns null when execFile errors', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return { ...actualFs, existsSync: vi.fn().mockReturnValue(true) };
      });
      vi.doMock('child_process', () => ({
        execFile: vi.fn((_bin, _args, _opts, cb: (err: Error | null, stdout: string) => void) => {
          cb(new Error('boom'), '');
          return { on: vi.fn() };
        }),
        execSync: vi.fn(),
      }));

      const mod = await import('./ytdlp-manager');
      expect(await mod.getYtDlpVersion()).toBeNull();
    });
  });

  describe('getLatestYtDlpVersion', () => {
    it('returns trimmed tag_name from GitHub releases API', async () => {
      vi.resetModules();
      vi.doMock('./http', () => ({
        requestJson: vi.fn().mockResolvedValue({ tag_name: '2024.12.31 ' }),
        requestText: vi.fn(),
      }));

      const mod = await import('./ytdlp-manager');
      expect(await mod.getLatestYtDlpVersion()).toBe('2024.12.31');
    });

    it('returns null when tag_name is missing', async () => {
      vi.resetModules();
      vi.doMock('./http', () => ({
        requestJson: vi.fn().mockResolvedValue({}),
        requestText: vi.fn(),
      }));

      const mod = await import('./ytdlp-manager');
      expect(await mod.getLatestYtDlpVersion()).toBeNull();
    });

    it('returns null on request error', async () => {
      vi.resetModules();
      vi.doMock('./http', () => ({
        requestJson: vi.fn().mockRejectedValue(new Error('network down')),
        requestText: vi.fn(),
      }));

      const mod = await import('./ytdlp-manager');
      expect(await mod.getLatestYtDlpVersion()).toBeNull();
    });
  });

  describe('downloadYtDlp', () => {
    let tempDir: string;
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      tempDir = makeTempDir();
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    });

    it('downloads, chmods, and renames on darwin', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      vi.resetModules();

      const mockDownloadFile = vi.fn(async (_url, _dest, onProgress?: (p: number) => void) => {
        onProgress?.(50);
        onProgress?.(100);
      });
      const mockChmodSync = vi.fn();
      const mockRenameSync = vi.fn();
      const mockMkdirSync = vi.fn();
      const mockUnlinkSync = vi.fn();

      vi.doMock('./utils/net-download', () => ({ downloadFile: mockDownloadFile }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
        execFile: vi.fn(),
      }));
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          mkdirSync: mockMkdirSync,
          chmodSync: mockChmodSync,
          renameSync: mockRenameSync,
          unlinkSync: mockUnlinkSync,
          existsSync: vi.fn().mockReturnValue(true),
        };
      });

      const onProgress = vi.fn();
      const mod = await import('./ytdlp-manager');
      await mod.downloadYtDlp(onProgress);

      expect(mockDownloadFile).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(50);
      expect(onProgress).toHaveBeenCalledWith(100);
      expect(mockChmodSync).toHaveBeenCalled();
      expect(mockRenameSync).toHaveBeenCalled();
    });

    it('does not chmod on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.resetModules();

      const mockDownloadFile = vi.fn(async () => {});
      const mockChmodSync = vi.fn();
      const mockRenameSync = vi.fn();

      vi.doMock('./utils/net-download', () => ({ downloadFile: mockDownloadFile }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
        execFile: vi.fn(),
      }));
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          mkdirSync: vi.fn(),
          chmodSync: mockChmodSync,
          renameSync: mockRenameSync,
          unlinkSync: vi.fn(),
          existsSync: vi.fn().mockReturnValue(true),
        };
      });

      const mod = await import('./ytdlp-manager');
      await mod.downloadYtDlp();

      expect(mockChmodSync).not.toHaveBeenCalled();
      expect(mockRenameSync).toHaveBeenCalled();
    });

    it('cleans up partial download and rethrows on error', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      vi.resetModules();

      const mockUnlinkSync = vi.fn();
      vi.doMock('./utils/net-download', () => ({
        downloadFile: vi.fn().mockRejectedValue(new Error('download failed')),
      }));
      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
        execFile: vi.fn(),
      }));
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          mkdirSync: vi.fn(),
          chmodSync: vi.fn(),
          renameSync: vi.fn(),
          unlinkSync: mockUnlinkSync,
          existsSync: vi.fn().mockReturnValue(true),
        };
      });

      const mod = await import('./ytdlp-manager');
      await expect(mod.downloadYtDlp()).rejects.toThrow('download failed');
      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });
});
