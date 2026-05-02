import Store from 'electron-store';
import type { ToolStatusCache } from './ipc/downloader';

/**
 * StoreSchema — the typed shape of the persistent electron-store.
 *
 * The main process owns this schema. Keys whose value shape is fully
 * determined by renderer code (e.g. `player-state`, `window-bounds`) are
 * typed as `unknown` here on purpose: the renderer narrows them at each
 * call site via the `store.get<T>(key)` generic in the preload API, and
 * the main process never interprets those blobs. Keys the main process
 * reads or writes directly are typed precisely so call sites can drop
 * their `as` casts.
 *
 * When adding a new key, also update the renderer-access allowlist in
 * `ipc/store.ts` if the renderer needs IPC access — see the doc block
 * there for the gate/dual-access rules.
 */
export interface StoreSchema {
  // Renderer-owned blob; read by discord-rpc.ts for `discordRpc` flag.
  settings: Record<string, unknown>;

  // Renderer-owned; shape lives in the web package.
  'music-folders': unknown;
  'player-state': unknown;
  'window-bounds': unknown;

  // Main-only: position of the compact mini-player. Persisted on exit-compact
  // so the next enter-compact restores to the same screen corner.
  'compact-window-bounds': { x: number; y: number };

  // Renderer-owned scalars.
  'player.volume': number;
  'player.isMuted': boolean;
  theme: 'light' | 'dark' | 'system';
  'app.language': string;
  'metadata-enrich.skippedIds': string[];

  // Main-only (downloader.ts).
  'downloads.location': string;
  'downloads.toolStatusCache': ToolStatusCache;

  // Main-only migration flags.
  'migrations.albumArtV1': boolean;
}

export const store = new Store<StoreSchema>();
