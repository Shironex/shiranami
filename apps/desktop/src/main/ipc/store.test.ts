import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  ];

  describe('store:get', () => {
    it('returns value for allowed keys', () => {
      mockStore.get.mockReturnValue('dark');
      const get = ipcHandlers.get('store:get')!;

      const result = get(null as never, 'theme');
      expect(result).toBe('dark');
      expect(mockStore.get).toHaveBeenCalledWith('theme');
    });

    it('throws for disallowed key', () => {
      const get = ipcHandlers.get('store:get')!;
      expect(() => get(null as never, 'secret-key')).toThrow('Store key not allowed: "secret-key"');
    });
  });

  describe('store:set', () => {
    it('sets value for allowed keys', () => {
      const set = ipcHandlers.get('store:set')!;
      set(null as never, 'player.volume', 0.75);

      expect(mockStore.set).toHaveBeenCalledWith('player.volume', 0.75);
    });

    it('throws for disallowed key', () => {
      const set = ipcHandlers.get('store:set')!;
      expect(() => set(null as never, 'admin.password', 'hunter2')).toThrow(
        'Store key not allowed: "admin.password"',
      );
    });
  });

  describe('store:delete', () => {
    it('deletes an allowed key', () => {
      const del = ipcHandlers.get('store:delete')!;
      del(null as never, 'window-bounds');

      expect(mockStore.delete).toHaveBeenCalledWith('window-bounds');
    });

    it('throws for disallowed key', () => {
      const del = ipcHandlers.get('store:delete')!;
      expect(() => del(null as never, 'not-allowed')).toThrow(
        'Store key not allowed: "not-allowed"',
      );
    });
  });

  it('every allowed key works with store:get without throwing', () => {
    const get = ipcHandlers.get('store:get')!;
    for (const key of ALLOWED_KEYS) {
      expect(() => get(null as never, key)).not.toThrow();
    }
  });
});
