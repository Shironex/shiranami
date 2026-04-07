import { ipcMain } from 'electron';
import { store } from '../store';
import { logger } from '../logger';

const ALLOWED_STORE_KEYS = new Set([
  'settings',
  'music-folders',
  'player-state',
  'player.volume',
  'player.isMuted',
  'theme',
  'window-bounds',
  'app.language',
  'metadata-enrich.skippedIds',
]);

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', (_event, key: string) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      logger.warn(`[store] Rejected access to disallowed key: "${key}"`);
      throw new Error(`Store key not allowed: "${key}"`);
    }
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      logger.warn(`[store] Rejected access to disallowed key: "${key}"`);
      throw new Error(`Store key not allowed: "${key}"`);
    }
    logger.debug(`[store] set "${key}"`);
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      logger.warn(`[store] Rejected access to disallowed key: "${key}"`);
      throw new Error(`Store key not allowed: "${key}"`);
    }
    logger.debug(`[store] delete "${key}"`);
    store.delete(key);
  });
}

export function cleanupStoreHandlers(): void {
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
}
