import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ipcHandlers } from '../../../test/setup';
import { cleanupStoreHandlers, registerStoreHandlers } from './store';

const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../store', () => ({
  store: {
    get: (...args: unknown[]) => mockStore.get(...args),
    set: (...args: unknown[]) => mockStore.set(...args),
    delete: (...args: unknown[]) => mockStore.delete(...args),
  },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('store ipc', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    registerStoreHandlers();
  });

  afterEach(() => {
    cleanupStoreHandlers();
  });

  const ALLOWED_KEYS = [
    'settings',
    'music-folders',
    'player-state',
    'player.volume',
    'player.isMuted',
    'theme',
    'window-bounds',
    'app.language',
    'metadata-enrich.skippedIds',
  ];

  describe('store:get', () => {
    it('returns value for allowed keys', async () => {
      mockStore.get.mockReturnValue('dark');
      const get = ipcHandlers.get('store:get')!;

      const result = await get(null as never, 'theme');
      expect(result).toBe('dark');
      expect(mockStore.get).toHaveBeenCalledWith('theme');
    });

    it('throws BAD_REQUEST for disallowed key', async () => {
      const get = ipcHandlers.get('store:get')!;
      await expect(get(null as never, 'secret-key')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('store:set', () => {
    it('sets value for allowed keys', async () => {
      const set = ipcHandlers.get('store:set')!;
      await set(null as never, 'player.volume', 0.75);

      expect(mockStore.set).toHaveBeenCalledWith('player.volume', 0.75);
    });

    it('throws BAD_REQUEST for disallowed key', async () => {
      const set = ipcHandlers.get('store:set')!;
      await expect(
        set(null as never, 'admin.password', 'hunter2'),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('store:delete', () => {
    it('deletes an allowed key', async () => {
      const del = ipcHandlers.get('store:delete')!;
      await del(null as never, 'window-bounds');

      expect(mockStore.delete).toHaveBeenCalledWith('window-bounds');
    });

    it('throws BAD_REQUEST for disallowed key', async () => {
      const del = ipcHandlers.get('store:delete')!;
      await expect(del(null as never, 'not-allowed')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  it('every allowed key works with store:get without throwing', async () => {
    const get = ipcHandlers.get('store:get')!;
    for (const key of ALLOWED_KEYS) {
      await expect(Promise.resolve(get(null as never, key))).resolves.not.toThrow();
    }
  });
});
