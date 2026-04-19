import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ipcHandlers } from '../../../test/setup';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockShowItemInFolder = vi.fn();
const mockTrashItem = vi.fn();

vi.mock('electron', async () => {
  const setup = await import('../../../test/setup');
  return {
    ipcMain: {
      handle(channel: string, fn: (...args: unknown[]) => unknown) {
        setup.ipcHandlers.set(channel, fn);
      },
      on(channel: string, listener: (...args: unknown[]) => void) {
        if (!setup.ipcOnListeners.has(channel)) {
          setup.ipcOnListeners.set(channel, new Set());
        }
        setup.ipcOnListeners.get(channel)!.add(listener);
      },
      removeHandler(channel: string) {
        setup.ipcHandlers.delete(channel);
      },
      removeAllListeners(channel: string) {
        setup.ipcOnListeners.delete(channel);
      },
    },
    shell: {
      showItemInFolder: (...args: unknown[]) => mockShowItemInFolder(...args),
      trashItem: (...args: unknown[]) => mockTrashItem(...args),
    },
  };
});

const mockIsPathAllowed = vi.fn<(p: string) => Promise<boolean>>();
vi.mock('../shared/folders-cache', () => ({
  isPathAllowed: (p: string) => mockIsPathAllowed(p),
}));

const { registerShellHandlers, cleanupShellHandlers } = await import('./shell');
const { isIpcError } = await import('./errors');

describe('shell ipc handlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    mockTrashItem.mockResolvedValue(undefined);
    registerShellHandlers();
  });

  afterEach(() => {
    cleanupShellHandlers();
  });

  /* ------------------------------------------------------------------ */
  /*  shell:show-in-folder                                              */
  /* ------------------------------------------------------------------ */

  describe('shell:show-in-folder', () => {
    it('calls shell.showItemInFolder when path is allowed', async () => {
      mockIsPathAllowed.mockResolvedValue(true);
      const handler = ipcHandlers.get('shell:show-in-folder')!;
      await handler(null as never, '/allowed/song.mp3');
      expect(mockShowItemInFolder).toHaveBeenCalledWith('/allowed/song.mp3');
    });

    it('throws IpcError(FORBIDDEN) and skips shell call when path is denied', async () => {
      mockIsPathAllowed.mockResolvedValue(false);
      const handler = ipcHandlers.get('shell:show-in-folder')!;

      await expect(handler(null as never, '/etc/passwd')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(mockShowItemInFolder).not.toHaveBeenCalled();
    });

    it('rejected error has the IpcError shape', async () => {
      mockIsPathAllowed.mockResolvedValue(false);
      const handler = ipcHandlers.get('shell:show-in-folder')!;

      try {
        await handler(null as never, '/etc/passwd');
        throw new Error('handler should have thrown');
      } catch (err) {
        expect(isIpcError(err)).toBe(true);
        expect((err as { code: string }).code).toBe('FORBIDDEN');
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /*  shell:trash-file                                                  */
  /* ------------------------------------------------------------------ */

  describe('shell:trash-file', () => {
    it('calls shell.trashItem when path is allowed', async () => {
      mockIsPathAllowed.mockResolvedValue(true);
      const handler = ipcHandlers.get('shell:trash-file')!;
      await handler(null as never, '/allowed/song.mp3');
      expect(mockTrashItem).toHaveBeenCalledWith('/allowed/song.mp3');
    });

    it('throws IpcError(FORBIDDEN) and skips trash call when path is denied', async () => {
      mockIsPathAllowed.mockResolvedValue(false);
      const handler = ipcHandlers.get('shell:trash-file')!;

      await expect(handler(null as never, '/etc/passwd')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(mockTrashItem).not.toHaveBeenCalled();
    });
  });
});
