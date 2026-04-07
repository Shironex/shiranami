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
          existsSync: vi.fn()
            .mockReturnValueOnce(false)  // ffmpeg
            .mockReturnValueOnce(true),  // ffprobe
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
          existsSync: vi.fn()
            .mockReturnValueOnce(true)   // ffmpeg
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

    it('uses PowerShell Expand-Archive instead of tar for extraction', async () => {
      vi.resetModules();

      // Mock child_process at module level
      const mockExecFileSync = vi.fn();
      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
        execFileSync: mockExecFileSync,
      }));

      // Mock electron app to use our temp dir
      vi.doMock('electron', () => ({
        app: {
          isPackaged: true,
          getPath: () => tempDir,
          getAppPath: () => tempDir,
        },
        net: {
          request: vi.fn(() => {
            // Simulate a successful download that writes a zip file
            const handlers: Record<string, (...args: unknown[]) => void> = {};
            return {
              on(event: string, cb: (...args: unknown[]) => void) {
                handlers[event] = cb;
              },
              end() {
                const responseHandlers: Record<string, (...args: unknown[]) => void> = {};
                const response = {
                  statusCode: 200,
                  headers: { 'content-length': '100' },
                  on(event: string, cb: (...args: unknown[]) => void) {
                    responseHandlers[event] = cb;
                  },
                };
                handlers['response']!(response);
                // Send data then end
                responseHandlers['data']!(Buffer.alloc(100));
                responseHandlers['end']!();
              },
            };
          }),
        },
      }));

      // Mock fs operations for the extraction flow
      const binDir = path.join(tempDir, 'bin');
      const extractDir = path.join(binDir, '_ffmpeg_extract');
      const ffmpegExe = path.join(extractDir, 'ffmpeg-build', 'bin', 'ffmpeg.exe');
      const ffprobeExe = path.join(extractDir, 'ffmpeg-build', 'bin', 'ffprobe.exe');

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
            // Simulate the nested ffmpeg archive structure
            if (dir === extractDir) {
              return [
                { name: 'ffmpeg-build', isFile: () => false, isDirectory: () => true },
              ];
            }
            if (dir.includes('ffmpeg-build') && dir.endsWith('bin')) {
              return [
                { name: 'ffmpeg.exe', isFile: () => true, isDirectory: () => false },
                { name: 'ffprobe.exe', isFile: () => true, isDirectory: () => false },
              ];
            }
            if (dir.includes('ffmpeg-build')) {
              return [
                { name: 'bin', isFile: () => false, isDirectory: () => true },
              ];
            }
            return [];
          }),
        };
      });

      const mod = await import('./ffmpeg-manager');
      await mod.downloadFFmpeg();

      // Verify PowerShell was called, NOT tar
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining([
          '-NoProfile',
          '-Command',
          expect.stringContaining('Expand-Archive'),
        ]),
        expect.objectContaining({ timeout: 120000 })
      );

      // Verify tar was NOT used
      const calls = mockExecFileSync.mock.calls;
      for (const call of calls) {
        expect(call[0]).not.toBe('tar');
      }
    });

    it('passes -Force flag to overwrite existing extraction', async () => {
      vi.resetModules();

      const mockExecFileSync = vi.fn();
      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
        execFileSync: mockExecFileSync,
      }));

      vi.doMock('electron', () => ({
        app: {
          isPackaged: true,
          getPath: () => tempDir,
          getAppPath: () => tempDir,
        },
        net: {
          request: vi.fn(() => {
            const handlers: Record<string, (...args: unknown[]) => void> = {};
            return {
              on(event: string, cb: (...args: unknown[]) => void) {
                handlers[event] = cb;
              },
              end() {
                const responseHandlers: Record<string, (...args: unknown[]) => void> = {};
                const response = {
                  statusCode: 200,
                  headers: { 'content-length': '100' },
                  on(event: string, cb: (...args: unknown[]) => void) {
                    responseHandlers[event] = cb;
                  },
                };
                handlers['response']!(response);
                responseHandlers['data']!(Buffer.alloc(100));
                responseHandlers['end']!();
              },
            };
          }),
        },
      }));

      const extractDir = path.join(tempDir, 'bin', '_ffmpeg_extract');
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

      const mod = await import('./ffmpeg-manager');
      await mod.downloadFFmpeg();

      const expandCmd = mockExecFileSync.mock.calls[0]![2 as number];
      const powershellCommand = mockExecFileSync.mock.calls[0]![1 as number] as string[];
      expect(powershellCommand.some((arg: string) => arg.includes('-Force'))).toBe(true);
    });

    it('cleans up zip and extract dir on extraction failure', async () => {
      vi.resetModules();

      const mockExecFileSync = vi.fn().mockImplementation(() => {
        throw new Error('PowerShell failed');
      });
      const mockUnlinkSync = vi.fn();
      const mockRmSync = vi.fn();

      vi.doMock('child_process', () => ({
        execSync: vi.fn(),
        execFileSync: mockExecFileSync,
      }));

      vi.doMock('electron', () => ({
        app: {
          isPackaged: true,
          getPath: () => tempDir,
          getAppPath: () => tempDir,
        },
        net: {
          request: vi.fn(() => {
            const handlers: Record<string, (...args: unknown[]) => void> = {};
            return {
              on(event: string, cb: (...args: unknown[]) => void) {
                handlers[event] = cb;
              },
              end() {
                const responseHandlers: Record<string, (...args: unknown[]) => void> = {};
                const response = {
                  statusCode: 200,
                  headers: { 'content-length': '100' },
                  on(event: string, cb: (...args: unknown[]) => void) {
                    responseHandlers[event] = cb;
                  },
                };
                handlers['response']!(response);
                responseHandlers['data']!(Buffer.alloc(100));
                responseHandlers['end']!();
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

      await expect(mod.downloadFFmpeg()).rejects.toThrow('PowerShell failed');

      // Should attempt cleanup of zip file and extract dir
      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(mockRmSync).toHaveBeenCalled();
    });
  });
});
