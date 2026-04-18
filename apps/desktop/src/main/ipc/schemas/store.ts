import { z } from 'zod';
import type { StoreSchema } from '../../store';

/**
 * Renderer-accessible store keys. This list MUST stay in sync with the
 * ALLOWED_STORE_KEYS narrative in `../store.ts` — keys the main process
 * owns exclusively (e.g. `downloads.location`, `downloads.toolStatusCache`)
 * are deliberately absent so the renderer cannot read or write them.
 *
 * The tuple-of-const-literals pattern lets TypeScript guarantee every listed
 * key is a member of `StoreSchema` (see the `_assertKeys` line below).
 */
const RENDERER_STORE_KEYS = [
  'settings',
  'music-folders',
  'player-state',
  'player.volume',
  'player.isMuted',
  'theme',
  'window-bounds',
  'app.language',
  'metadata-enrich.skippedIds',
] as const;

// Compile-time guarantee: every entry is a StoreSchema key.
type _RendererKey = (typeof RENDERER_STORE_KEYS)[number];
const _assertKeys = (k: _RendererKey): keyof StoreSchema => k;
void _assertKeys;

export const rendererStoreKey = z.enum(RENDERER_STORE_KEYS);

export const storeGetArgs = z.tuple([rendererStoreKey]);
export const storeSetArgs = z.tuple([rendererStoreKey, z.unknown()]);
export const storeDeleteArgs = z.tuple([rendererStoreKey]);
