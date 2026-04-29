import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { makeTempDir, cleanupTempDir } from '../../test/setup';

// Mock electron — app and net are needed by ffmpeg-manager
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

describe('ffmpeg-manager', () => {
  describe('getFFmpegPath', () => {
    it('returns path with .exe on win32', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Re-import to pick up platform change
      vi.resetModules();
      const mod = await import('./ffmpeg-manager');
      const result = mod.getFFmpegPath();

      expect(result).toContain('ffmpeg.exe');
      expect(result).toContain('bin');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns path without .exe on darwin', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      vi.resetModules();
      const mod = await import('./ffmpeg-manager');
      const result = mod.getFFmpegPath();

      expect(result).not.toContain('.exe');
      expect(result).toMatch(/ffmpeg$/);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('getFFprobePath', () => {
    it('returns path with .exe on win32', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      vi.resetModules();
      const mod = await import('./ffmpeg-manager');
      const result = mod.getFFprobePath();

      expect(result).toContain('ffprobe.exe');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('isFFmpegInstalled', () => {
    it('returns true when both ffmpeg and ffprobe exist', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return { ...actualFs, existsSync: vi.fn().mockReturnValue(true) };
      });

      const mod = await import('./ffmpeg-manager');
      expect(mod.isFFmpegInstalled()).toBe(true);
    });

    it('returns false when ffmpeg is missing', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          existsSync: vi
            .fn()
            .mockReturnValueOnce(false) // ffmpeg
            .mockReturnValueOnce(true), // ffprobe
        };
      });

      const mod = await import('./ffmpeg-manager');
      expect(mod.isFFmpegInstalled()).toBe(false);
    });

    it('returns false when ffprobe is missing', async () => {
      vi.resetModules();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          existsSync: vi
            .fn()
            .mockReturnValueOnce(true) // ffmpeg
            .mockReturnValueOnce(false), // ffprobe
        };
      });

      const mod = await import('./ffmpeg-manager');
      expect(mod.isFFmpegInstalled()).toBe(false);
    });
  });

  describe('downloadFFmpeg (Windows extraction)', () => {
    let tempDir: string;
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      tempDir = makeTempDir();
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    // Helper: mock Worker to simulate extraction result
    function createDownloadMocks(workerResponse: {
      success: boolean;
      method?: string;
      error?: string;
    }) {
      const mockWorkerConstructor = vi.fn();
      const extractDir = path.join(tempDir, 'bin', '_ffmpeg_extract');

      vi.doMock('node:worker_threads', () => ({
        Worker: vi.fn().mockImplementation(function () {
          const handlers: Record<string, (...args: unknown[]) => void> = {};
          mockWorkerConstructor();
          // Simulate async worker message
          setTimeout(() => handlers['message']?.(workerResponse), 0);
          return {
            on(event: string, cb: (...args: unknown[]) => void) {
              handlers[event] = cb;
              return this;
            },
          };
        }),
      }));

      vi.doMock('child_process', () => ({ execFileSync: vi.fn() }));

      vi.doMock('electron', () => ({
        app: { isPackaged: true, getPath: () => tempDir, getAppPath: () => tempDir },
        net: {
          request: vi.fn(() => {
            const handlers: Record<string, (...args: unknown[]) => void> = {};
            return {
              on(event: string, cb: (...args: unknown[]) => void) {
                handlers[event] = cb;
              },
              end() {
                const rh: Record<string, (...args: unknown[]) => void> = {};
                handlers['response']!({
                  statusCode: 200,
                  headers: { 'content-length': '100' },
                  on(event: string, cb: (...args: unknown[]) => void) {
                    rh[event] = cb;
                  },
                });
                rh['data']!(Buffer.alloc(100));
                rh['end']!();
              },
            };
          }),
        },
      }));

      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          mkdirSync: vi.fn(),
          unlinkSync: vi.fn(),
          copyFileSync: vi.fn(),
          rmSync: vi.fn(),
          existsSync: vi.fn().mockReturnValue(true),
          createWriteStream: vi.fn(() => ({
            write: vi.fn(),
            end: vi.fn((cb: () => void) => cb()),
            destroy: vi.fn(),
            on: vi.fn(),
          })),
          readdirSync: vi.fn((dir: string) => {
            if (dir === extractDir) {
              return [{ name: 'ffmpeg-build', isFile: () => false, isDirectory: () => true }];
            }
            if (dir.includes('ffmpeg-build') && dir.endsWith('bin')) {
              return [
                { name: 'ffmpeg.exe', isFile: () => true, isDirectory: () => false },
                { name: 'ffprobe.exe', isFile: () => true, isDirectory: () => false },
              ];
            }
            if (dir.includes('ffmpeg-build')) {
              return [{ name: 'bin', isFile: () => false, isDirectory: () => true }];
            }
            return [];
          }),
        };
      });

      return { mockWorkerConstructor };
    }

    it('spawns a worker thread for extraction', async () => {
      vi.resetModules();
      const { mockWorkerConstructor } = createDownloadMocks({ success: true, method: 'adm-zip' });

      const mod = await import('./ffmpeg-manager');
      await mod.downloadFFmpeg();

      expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    });

    it('resolves when worker reports success', async () => {
      vi.resetModules();
      createDownloadMocks({ success: true, method: 'tar' });

      const mod = await import('./ffmpeg-manager');
      // Should not throw
      await expect(mod.downloadFFmpeg()).resolves.toBeUndefined();
    });

    it('rejects when worker reports failure', async () => {
      vi.resetModules();
      createDownloadMocks({ success: false, error: 'all extractors failed' });

      const mod = await import('./ffmpeg-manager');
      await expect(mod.downloadFFmpeg()).rejects.toThrow('all extractors failed');
    });

    it('cleans up zip and extract dir on extraction failure', async () => {
      vi.resetModules();

      const mockUnlinkSync = vi.fn();
      const mockRmSync = vi.fn();

      vi.doMock('node:worker_threads', () => ({
        Worker: vi.fn().mockImplementation(function () {
          const handlers: Record<string, (...args: unknown[]) => void> = {};
          setTimeout(
            () => handlers['message']?.({ success: false, error: 'extraction failed' }),
            0
          );
          return {
            on(event: string, cb: (...args: unknown[]) => void) {
              handlers[event] = cb;
              return this;
            },
          };
        }),
      }));

      vi.doMock('child_process', () => ({ execFileSync: vi.fn() }));

      vi.doMock('electron', () => ({
        app: { isPackaged: true, getPath: () => tempDir, getAppPath: () => tempDir },
        net: {
          request: vi.fn(() => {
            const handlers: Record<string, (...args: unknown[]) => void> = {};
            return {
              on(event: string, cb: (...args: unknown[]) => void) {
                handlers[event] = cb;
              },
              end() {
                const rh: Record<string, (...args: unknown[]) => void> = {};
                handlers['response']!({
                  statusCode: 200,
                  headers: { 'content-length': '100' },
                  on(event: string, cb: (...args: unknown[]) => void) {
                    rh[event] = cb;
                  },
                });
                rh['data']!(Buffer.alloc(100));
                rh['end']!();
              },
            };
          }),
        },
      }));

      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          mkdirSync: vi.fn(),
          unlinkSync: mockUnlinkSync,
          copyFileSync: vi.fn(),
          rmSync: mockRmSync,
          existsSync: vi.fn().mockReturnValue(true),
          createWriteStream: vi.fn(() => ({
            write: vi.fn(),
            end: vi.fn((cb: () => void) => cb()),
            destroy: vi.fn(),
            on: vi.fn(),
          })),
        };
      });

      const mod = await import('./ffmpeg-manager');

      await expect(mod.downloadFFmpeg()).rejects.toThrow('extraction failed');

      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(mockRmSync).toHaveBeenCalled();
    });
  });

  describe('downloadFFmpeg (darwin extraction)', () => {
    let tempDir: string;
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      tempDir = makeTempDir();
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    function mockDarwinFs() {
      const mockUnlinkSync = vi.fn();
      const mockChmodSync = vi.fn();
      vi.doMock('fs', async () => {
        const actualFs = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actualFs,
          mkdirSync: vi.fn(),
          unlinkSync: mockUnlinkSync,
          chmodSync: mockChmodSync,
          existsSync: vi.fn().mockReturnValue(true),
        };
      });
      return { mockUnlinkSync, mockChmodSync };
    }

    function mockDarwinDownload() {
      const mockDownloadFile = vi.fn(
        async (_url: string, _dest: string, onProgress?: (p: number) => void) => {
          onProgress?.(50);
          onProgress?.(100);
        }
      );
      vi.doMock('./utils/net-download', () => ({ downloadFile: mockDownloadFile }));
      return mockDownloadFile;
    }

    it('unzips with execFileSync argv and strips quarantine on happy path', async () => {
      vi.resetModules();
      const mockExecFileSync = vi.fn();
      const mockDownloadFile = mockDarwinDownload();
      const { mockUnlinkSync, mockChmodSync } = mockDarwinFs();
      vi.doMock('child_process', () => ({ execFileSync: mockExecFileSync }));

      const onProgress = vi.fn();
      const mod = await import('./ffmpeg-manager');
      await mod.downloadFFmpeg(onProgress);

      // Two downloads (ffmpeg + ffprobe)
      expect(mockDownloadFile).toHaveBeenCalledTimes(2);

      // Four execFileSync calls: unzip ffmpeg, unzip ffprobe, xattr ffmpeg, xattr ffprobe
      expect(mockExecFileSync).toHaveBeenCalledTimes(4);

      // Security regression net: assert argv shape, not template strings.
      const calls = mockExecFileSync.mock.calls;
      expect(calls[0]?.[0]).toBe('unzip');
      expect(calls[0]?.[1]).toEqual([
        '-o',
        expect.stringContaining('ffmpeg.zip'),
        '-d',
        expect.any(String),
      ]);
      expect(calls[1]?.[0]).toBe('unzip');
      expect(calls[1]?.[1]).toEqual([
        '-o',
        expect.stringContaining('ffprobe.zip'),
        '-d',
        expect.any(String),
      ]);
      expect(calls[2]?.[0]).toBe('xattr');
      expect(calls[2]?.[1]).toEqual([
        '-d',
        'com.apple.quarantine',
        expect.stringMatching(/ffmpeg$/),
      ]);
      expect(calls[3]?.[0]).toBe('xattr');
      expect(calls[3]?.[1]).toEqual([
        '-d',
        'com.apple.quarantine',
        expect.stringMatching(/ffprobe$/),
      ]);

      // Zip cleanup + chmod happened
      expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
      expect(mockChmodSync).toHaveBeenCalledTimes(2);

      // Progress reached ~98 (last call before chmod/xattr is 98)
      const progressValues = onProgress.mock.calls.map(c => c[0] as number);
      expect(progressValues).toContain(98);
      expect(progressValues).toContain(100);
    });

    it('swallows xattr failures and still resolves', async () => {
      vi.resetModules();
      const mockExecFileSync = vi.fn((bin: string) => {
        if (bin === 'xattr') {
          throw new Error('xattr: No such xattr: com.apple.quarantine');
        }
      });
      mockDarwinDownload();
      mockDarwinFs();
      vi.doMock('child_process', () => ({ execFileSync: mockExecFileSync }));

      const mod = await import('./ffmpeg-manager');

      // Must resolve even though both xattr calls threw — the try/catch block
      // in downloadFFmpegMac deliberately swallows xattr failures.
      await expect(mod.downloadFFmpeg()).resolves.toBeUndefined();

      // Confirm xattr was actually called (proves we hit the swallowed branch,
      // not that we skipped it).
      const xattrCalls = mockExecFileSync.mock.calls.filter(c => c[0] === 'xattr');
      expect(xattrCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
