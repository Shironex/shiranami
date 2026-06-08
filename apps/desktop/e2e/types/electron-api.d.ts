// Ambient typing for the slice of `window.electronAPI` that e2e specs reach
// through `page.evaluate`. The production preload bridges a much larger
// surface — only the methods specs actually call are declared here, to keep
// drift between this file and the real bridge obvious.

export interface E2ETrackRow {
  id: string;
  filePath: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  duration: number | null;
  isFavorite: boolean;
  playCount: number;
}

export interface E2EPlaylistRow {
  id: string;
  name: string;
  description: string | null;
}

export interface E2EFolderRow {
  id: string;
  path: string;
}

export interface E2EElectronAPI {
  db: {
    tracks: {
      getAll: () => Promise<E2ETrackRow[]>;
      add: (track: Record<string, unknown>) => Promise<E2ETrackRow>;
      addMany: (tracks: Array<Record<string, unknown>>) => Promise<E2ETrackRow[]>;
      remove: (id: string) => Promise<void>;
      removeMany: (ids: string[]) => Promise<void>;
      toggleFavorite: (id: string) => Promise<E2ETrackRow>;
      getFavorites: () => Promise<E2ETrackRow[]>;
    };
    playlists: {
      getAll: () => Promise<E2EPlaylistRow[]>;
      get: (id: string) => Promise<E2EPlaylistRow & { tracks: E2ETrackRow[] }>;
      create: (data: {
        name: string;
        description?: string;
        coverArt?: string;
      }) => Promise<E2EPlaylistRow>;
      createWithTracks: (data: {
        name: string;
        description?: string;
        trackIds: string[];
      }) => Promise<E2EPlaylistRow>;
      update: (
        id: string,
        data: { name?: string; description?: string }
      ) => Promise<E2EPlaylistRow>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<E2ETrackRow[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
    };
    folders: {
      getAll: () => Promise<E2EFolderRow[]>;
      add: (path: string) => Promise<E2EFolderRow>;
      remove: (id: string) => Promise<void>;
    };
  };
  library: {
    scanFolder: (path: string) => Promise<unknown>;
    scanFolderGrouped: (path: string) => Promise<{ rootTracks: unknown[]; subfolders: unknown[] }>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  share: {
    onDeepLink: (cb: (code: string) => void) => () => void;
  };
  platform: NodeJS.Platform;
  __e2e: boolean;
}

export interface E2ETrack {
  id: string;
  filePath: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  isFavorite: boolean;
}

export interface E2EZustandStore<T> {
  getState: () => T;
  setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (cb: (s: T) => void) => () => void;
}

export interface E2EPlaybackState {
  isPlaying: boolean;
  currentTrack: E2ETrack | null;
  queue: E2ETrack[];
  queueIndex: number;
  repeatMode: 'off' | 'all' | 'one';
  shuffleEnabled: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  setQueue: (tracks: E2ETrack[], startIndex?: number) => void;
}

export interface E2EShiranamiBridge {
  stores: {
    playback: E2EZustandStore<E2EPlaybackState>;
    library: E2EZustandStore<Record<string, unknown>>;
    eq: E2EZustandStore<Record<string, unknown>>;
    ui: E2EZustandStore<Record<string, unknown>>;
    view: E2EZustandStore<Record<string, unknown>>;
    playlistImport: E2EZustandStore<Record<string, unknown>>;
    selection: E2EZustandStore<Record<string, unknown>>;
  };
}

declare global {
  interface Window {
    electronAPI: E2EElectronAPI;
    __shiranami?: E2EShiranamiBridge;
  }
}

export {};
