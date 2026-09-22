/**
 * The slice of the renderer's globals this suite calls.
 *
 * Deliberately **not** imported from `@shiranami/contracts`. Declaring only what
 * the specs touch is what makes drift visible: if the shim renames a method, the
 * mismatch shows up here as a compile error in a file whose whole purpose is to
 * state what E2E depends on. Importing the real type would instead make the
 * suite silently agree with whatever the shim became — which is the failure v1's
 * `types/electron-api.d.ts` was written to avoid, with the same reasoning.
 */

interface E2ETrack {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumArt: string | null;
  filePath: string;
  duration: number | null;
  isFavorite: boolean;
  playCount: number;
}

interface E2EPlaylist {
  id: string;
  name: string;
  description: string | null;
}

interface E2EFolder {
  id: string;
  path: string;
}

interface E2EScanResult {
  filePath: string;
  metadata: { title?: string | null; artist?: string | null; album?: string | null };
}

interface E2EGroupedScan {
  rootTracks: E2EScanResult[];
  /** Only subdirectories that held at least one audio file. */
  subfolders: { name: string; path: string; tracks: E2EScanResult[] }[];
}

interface E2EPlaybackState {
  isPlaying: boolean;
  queueIndex: number;
  queue: { id: string }[];
  currentTrack: { id: string } | null;
  currentTime: number;
  volume: number;
  repeatMode: string;
  setQueue: (queue: unknown[], startIndex?: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  /** No `setRepeatMode` exists — the store only cycles. See playback-store.spec. */
  cycleRepeatMode: () => void;
}

interface E2EEqState {
  enabled: boolean;
  preset: string;
  preampDb: number;
  gains: number[];
  setEnabled: (value: boolean) => void;
  setBandGain: (index: number, gain: number) => void;
  setPreampDb: (value: number) => void;
  applyPreset: (preset: string) => void;
  reset: () => void;
}

interface E2ELibraryState {
  library: E2ETrack[];
  setLibrary: (tracks: unknown[]) => void;
}

interface E2EStore<T> {
  getState: () => T;
  setState: (partial: Partial<T>) => void;
}

interface Window {
  electronAPI: {
    platform: string;
    __e2e: boolean;
    db: {
      tracks: {
        getAll: () => Promise<E2ETrack[]>;
        addMany: (tracks: unknown[]) => Promise<E2ETrack[]>;
        removeMany: (ids: string[]) => Promise<unknown>;
        update: (id: string, patch: Record<string, unknown>) => Promise<E2ETrack>;
        toggleFavorite: (id: string) => Promise<E2ETrack>;
        getFavorites: () => Promise<E2ETrack[]>;
      };
      playlists: {
        getAll: () => Promise<E2EPlaylist[]>;
        create: (input: { name: string; description?: string }) => Promise<E2EPlaylist>;
        createWithTracks: (input: {
          name: string;
          trackIds: string[];
          description?: string;
        }) => Promise<E2EPlaylist>;
        update: (id: string, patch: { name?: string }) => Promise<E2EPlaylist>;
        delete: (id: string) => Promise<unknown>;
        getTracks: (id: string) => Promise<E2ETrack[]>;
        addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
        removeTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      };
      folders: {
        getAll: () => Promise<E2EFolder[]>;
        add: (path: string) => Promise<E2EFolder>;
        remove: (id: string) => Promise<unknown>;
      };
    };
    library: {
      /** No production caller — see `library-scan.spec.ts`. */
      scanFolder: (dirPath: string) => Promise<E2EScanResult[]>;
      /** What add-folder, rescan and onboarding all actually call. */
      scanFolderGrouped: (dirPath: string) => Promise<E2EGroupedScan>;
    };
    store: {
      /**
       * `null` for an absent key, not `undefined` — the shim types this as
       * `T | undefined` but does not run it through `wire.ts`'s `orUndefined`.
       * Declared honestly here; see `invoke-roundtrip.spec.ts`.
       */
      get: <T>(key: string) => Promise<T | null>;
      set: (key: string, value: unknown) => Promise<void>;
      delete: (key: string) => Promise<void>;
    };
    window: {
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
    };
  };

  /** Only present under `SHIRANAMI_E2E=1`; see `apps/web/src/e2e-bridge.ts`. */
  __shiranami?: {
    stores: {
      playback: E2EStore<E2EPlaybackState>;
      library: E2EStore<E2ELibraryState>;
      eq: E2EStore<E2EEqState>;
      ui: E2EStore<Record<string, unknown>>;
      view: E2EStore<Record<string, unknown>>;
      playlistImport: E2EStore<Record<string, unknown>>;
      selection: E2EStore<Record<string, unknown>>;
    };
  };
}
