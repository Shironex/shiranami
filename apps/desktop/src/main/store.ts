import Store from 'electron-store';
import type { DiscordRpcSettings } from '@shiranami/shared';
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
  // Renderer-owned blob of misc app settings.
  settings: Record<string, unknown>;

  // Main-only (discord-rpc.ts): the single source of truth for Discord Rich
  // Presence settings. Owned by the RPC service; the renderer reads/writes it
  // only through the dedicated discord-rpc IPC channels, never via store:get/set.
  'discord-rpc-settings': DiscordRpcSettings;

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
  'app.onboardingCompleted': boolean;
  // Support launch banner — shown once ever, after onboarding.
  'app.supportBannerSeen': boolean;
  // Opt-in crash/error reporting (Sentry). Default is implicit `undefined` →
  // treated as `false`; no `defaults` value is set so a fresh install never
  // initializes Sentry until the user explicitly enables it.
  'app.telemetryEnabled': boolean;
  // Opt-in performance tracing (Sentry). A sub-option of telemetry: only takes
  // effect when crash reporting is also on. Default `undefined` → off, so no
  // transactions are sampled until the user explicitly enables it.
  'app.performanceMonitoringEnabled': boolean;
  'metadata-enrich.skippedIds': string[];

  // Main-only (downloader.ts).
  'downloads.location': string;
  'downloads.toolStatusCache': ToolStatusCache;

  // Main-only migration flags.
  'migrations.albumArtV1': boolean;

  // Main-only (scrobbler.ts): opt-in scrobbling settings + secrets. The raw
  // Last.fm session key / ListenBrainz token NEVER round-trip to the renderer
  // (it reads only a {connected} status via the scrobble IPC), mirroring how
  // discord-rpc-settings stays main-owned. Default undefined → scrobbling off,
  // so no network fires until the user connects an account.
  'scrobble.settings': {
    /** Master switch — when false, no scrobbles or now-playing pings fire. */
    enabled: boolean;
    /** Last.fm session key (infinite lifetime), or null when not connected. */
    lastfmSessionKey: string | null;
    /** Last.fm account name, kept for display only. */
    lastfmUsername: string | null;
    /** ListenBrainz user token, or null when not connected. */
    listenBrainzToken: string | null;
  };
}

export const store = new Store<StoreSchema>();
