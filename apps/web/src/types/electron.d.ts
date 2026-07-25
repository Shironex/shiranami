/**
 * Renderer-side declaration of `window.electronAPI`.
 *
 * The namespaces themselves are NOT restated here — they are imported from
 * `@shiranami/contracts`, which is also what the preload modules
 * (`apps/desktop/src/main/preload/api/*.ts`) implement. This file used to
 * hand-mirror all ~470 lines of that surface and the two copies drifted; now it
 * only adds the three namespaces whose types are environment-specific and so
 * cannot live in the dependency-free contracts package.
 *
 * `apps/web` must not import from `apps/desktop`, so `@shiranami/contracts` is
 * the shared home for anything crossing the bridge.
 */
import type { SharedElectronApi } from '@shiranami/contracts';
import type { DiscordRpcSettings, DiscordMusicPresenceActivity } from '@shiranami/shared';

// Cross-boundary shapes are defined once in @shiranami/contracts and re-exported
// here so renderer code can keep importing them from `@/types/electron`.
export type {
  Track,
  TrackMetadata,
  SearchResult,
  Playlist,
  WatchedFolder,
  DownloadProgress,
} from '@shiranami/contracts';

export type {
  ListeningHistoryEntry,
  ListeningStatsTrack,
  ListeningStatsArtist,
  ListeningStatsSummary,
  ListeningActivityPoint,
  ListeningHourlyActivityPoint,
  ListeningAlbumStat,
  WeeklyInsights,
} from '@shiranami/contracts';

export interface ElectronAPI extends SharedElectronApi {
  /**
   * Deliberately looser than the preload's `StoreApi`, which is keyed on the
   * desktop-only `StoreSchema`: the renderer cannot see that type, so it reads
   * and writes by string key. A one-way widening, not a contract break.
   */
  store: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  /** `openFile` options are Electron's `OpenDialogOptions`, unavailable here. */
  dialog: {
    openDirectory: () => Promise<string | null>;
    openFile: (options?: unknown) => Promise<string | null>;
  };
  discord: {
    getSettings: () => Promise<DiscordRpcSettings>;
    updateSettings: (updates: Partial<DiscordRpcSettings>) => Promise<DiscordRpcSettings>;
    updatePresence: (activity: DiscordMusicPresenceActivity) => Promise<void>;
    clearPresence: () => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
