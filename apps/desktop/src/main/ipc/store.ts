import { ipcMain } from 'electron';
import { store } from '../store';

const ALLOWED_STORE_KEYS = new Set([
  'settings',
  'music-folders',
  'player-state',
  'theme',
  'window-bounds',
]);

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', (_event, key: string) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      throw new Error(`Store key not allowed: "${key}"`);
    }
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      throw new Error(`Store key not allowed: "${key}"`);
    }
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    if (!ALLOWED_STORE_KEYS.has(key)) {
      throw new Error(`Store key not allowed: "${key}"`);
    }
    store.delete(key);
  });
}

export function cleanupStoreHandlers(): void {
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
}
