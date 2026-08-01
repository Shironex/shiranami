import type { ElectronAPI } from '@/types/electron';
import type { RendererStoreKey } from '@shiranami/contracts/bindings';
import { commands } from '../commands';

/**
 * The renderer reads and writes by bare string because it cannot see the
 * desktop `StoreSchema` — a deliberate one-way widening its `types/electron.d.ts`
 * documents. The backend narrows the same keys for real: `store_get` takes a
 * `RendererStoreKey` and answers a key outside the allowlist with `BAD_REQUEST`,
 * which is v1's zod refusal in a different language. So the cast here re-states
 * the widening rather than defeating a check.
 */
const asKey = (key: string): RendererStoreKey => key as RendererStoreKey;

export const storeApi: ElectronAPI['store'] = {
  get: async <T>(key: string) => (await commands.storeGet(asKey(key))) as T | undefined,
  set: async (key, value) => {
    await commands.storeSet(asKey(key), value);
  },
  delete: async key => {
    await commands.storeDelete(asKey(key));
  },
};
