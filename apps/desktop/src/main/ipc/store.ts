import { ipcMain } from 'electron';
import { store, type StoreSchema } from '../store';
import { logger } from '../logger';

/**
 * ALLOWED_STORE_KEYS — renderer access gate for electron-store.
 *
 * The renderer reaches electron-store ONLY through the `store:get`/`store:set`/
 * `store:delete` IPC handlers below. Each handler checks the requested key
 * against this allowlist and rejects anything not listed. This prevents a
 * compromised renderer from reading or clobbering arbitrary persisted state.
 *
 * Direct `import { store } from '../store'` in other main-process modules
 * BYPASSES this gate — that is intentional, because the main process is
 * trusted. Use direct imports for keys that should never leave the main
 * process (binary paths, internal caches, etc.).
 *
 * Key classes:
 *   - Renderer-accessible (listed below): 'settings', 'music-folders',
 *     'player-state', 'player.volume', 'player.isMuted', 'theme',
 *     'window-bounds', 'app.language', 'metadata-enrich.skippedIds'.
 *   - Main-only (NOT listed; accessed via direct import):
 *       'downloads.location'          — downloader.ts
 *       'downloads.toolStatusCache'   — downloader.ts
 *   - Dual-access (listed AND read directly by main):
 *       'settings' — renderer owns the object; discord-rpc.ts reads
 *                    `settings.discordRpc` to decide whether to connect.
 *
 * When adding a new key:
 *   1. Add it to the StoreSchema in `../store.ts` with an exact value type.
 *   2. If the renderer needs it, add it here AND prefer dot.camelCase
 *      namespacing (e.g., `feature.subkey`) for new keys.
 *   3. If it's main-only, document the owner module here.
 */
const ALLOWED_STORE_KEYS = new Set<keyof StoreSchema>([
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

function isAllowedKey(key: string): key is keyof StoreSchema {
  return (ALLOWED_STORE_KEYS as Set<string>).has(key);
}

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', (_event, key: string) => {
    if (!isAllowedKey(key)) {
      logger.warn(`[store] Rejected access to disallowed key: "${key}"`);
      throw new Error(`Store key not allowed: "${key}"`);
    }
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    if (!isAllowedKey(key)) {
      logger.warn(`[store] Rejected access to disallowed key: "${key}"`);
      throw new Error(`Store key not allowed: "${key}"`);
    }
    logger.debug(`[store] set "${key}"`);
    store.set(key, value as StoreSchema[typeof key]);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    if (!isAllowedKey(key)) {
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
