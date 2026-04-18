import { ipcMain } from 'electron';
import { store, type StoreSchema } from '../store';
import { logger } from '../logger';
import { handle } from './with-ipc-handler';
import { storeGetArgs, storeSetArgs, storeDeleteArgs } from './schemas/store';

/**
 * Renderer access gate for electron-store — now enforced at the IPC boundary
 * by the zod `rendererStoreKey` enum in `./schemas/store.ts`. Anything not
 * in that enum is rejected with `IpcError('BAD_REQUEST')` before the handler
 * runs; the key is already guaranteed to be a `keyof StoreSchema` by the
 * time this module sees it.
 *
 * Direct `import { store } from '../store'` in other main-process modules
 * BYPASSES this gate — that is intentional, because the main process is
 * trusted. Use direct imports for keys that should never leave the main
 * process (binary paths, internal caches, etc.).
 *
 * Key classes:
 *   - Renderer-accessible: the enum in `./schemas/store.ts`.
 *   - Main-only (NOT in the enum; accessed via direct import):
 *       'downloads.location'          — downloader.ts
 *       'downloads.toolStatusCache'   — downloader.ts
 *   - Dual-access (enum-listed AND read directly by main):
 *       'settings' — renderer owns the object; discord-rpc.ts reads
 *                    `settings.discordRpc` to decide whether to connect.
 *
 * When adding a new key:
 *   1. Add it to the StoreSchema in `../store.ts` with an exact value type.
 *   2. If the renderer needs it, add it to `RENDERER_STORE_KEYS` in
 *      `./schemas/store.ts` AND prefer dot.camelCase namespacing.
 *   3. If it's main-only, document the owner module here.
 */
export function registerStoreHandlers(): void {
  handle(
    'store:get',
    (_event, key: keyof StoreSchema) => {
      return store.get(key);
    },
    { schema: storeGetArgs },
  );

  handle(
    'store:set',
    (_event, key: keyof StoreSchema, value: unknown) => {
      logger.debug(`[store] set "${key}"`);
      store.set(key, value as StoreSchema[typeof key]);
    },
    { schema: storeSetArgs },
  );

  handle(
    'store:delete',
    (_event, key: keyof StoreSchema) => {
      logger.debug(`[store] delete "${key}"`);
      store.delete(key);
    },
    { schema: storeDeleteArgs },
  );
}

export function cleanupStoreHandlers(): void {
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
}
