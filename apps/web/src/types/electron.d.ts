export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
}

export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  albumArt: string | null;
}

export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  };
  store: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
    openFile: (options?: unknown) => Promise<string | null>;
  };
  library: {
    parseMetadata: (filePath: string) => Promise<{ filePath: string; metadata: TrackMetadata }>;
    parseFiles: (filePaths: string[]) => Promise<Array<{ filePath: string; metadata: TrackMetadata }>>;
    scanFolder: (dirPath: string) => Promise<Array<{ filePath: string; metadata: TrackMetadata }>>;
  };
  media: {
    onCommand: (callback: (command: string) => void) => () => void;
    sendPlaybackState: (state: {
      isPlaying: boolean;
      title: string;
      artist: string;
      album: string;
      duration: number;
      currentTime: number;
      albumArt: string | null;
    }) => void;
    clearState: () => void;
  };
  lyrics: {
    fetch: (title: string, artist: string, album?: string, duration?: number) => Promise<{
      synced: Array<{ time: number; text: string }> | null;
      plain: string | null;
      source: 'lrclib' | 'cache' | null;
    }>;
  };
  db: {
    tracks: {
      getAll: () => Promise<unknown[]>;
      add: (track: unknown) => Promise<unknown>;
      addMany: (tracks: unknown[]) => Promise<unknown[]>;
      remove: (id: string) => Promise<void>;
      removeMany: (ids: string[]) => Promise<void>;
      update: (id: string, data: unknown) => Promise<unknown>;
      toggleFavorite: (id: string) => Promise<unknown>;
      getFavorites: () => Promise<unknown[]>;
      incrementPlayCount: (id: string) => Promise<unknown>;
      exists: (filePath: string) => Promise<boolean>;
    };
    playlists: {
      getAll: () => Promise<unknown[]>;
      get: (id: string) => Promise<unknown>;
      create: (data: { name: string; description?: string; coverArt?: string }) => Promise<unknown>;
      update: (id: string, data: { name?: string; description?: string; coverArt?: string }) => Promise<unknown>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<unknown[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
      reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
    };
    folders: {
      getAll: () => Promise<unknown[]>;
      add: (path: string) => Promise<unknown>;
      remove: (id: string) => Promise<void>;
      updateScanned: (id: string) => Promise<unknown>;
    };
  };
  downloader: {
    getStreamUrl: (url: string) => Promise<string>;
    search: (query: string) => Promise<SearchResult[]>;
    download: (url: string) => Promise<string>;
    getDownloadLocation: () => Promise<{
      path: string;
      defaultPath: string;
      isDefault: boolean;
    }>;
    setDownloadLocation: (path: string | null) => Promise<{
      path: string;
      defaultPath: string;
      isDefault: boolean;
    }>;
    checkDependencies: () => Promise<{ ytdlpInstalled: boolean; ffmpegInstalled: boolean }>;
    check: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    onProgress: (callback: (data: DownloadProgress) => void) => () => void;
    installYtDlp: () => Promise<{ success: boolean; error?: string }>;
    onInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    getYtDlpPath: () => Promise<string>;
    checkFfmpeg: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    installFfmpeg: () => Promise<{ success: boolean; error?: string }>;
    onFfmpegInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    installDependencies: () => Promise<{ success: boolean; error?: string }>;
    onDependencyInstallProgress: (callback: (progress: {
      target: 'ytdlp' | 'ffmpeg';
      percent: number;
      overallPercent: number;
      label: string;
    }) => void) => () => void;
  };
  updater: {
    checkForUpdates: () => Promise<{ enabled: boolean }>;
    startDownload: () => Promise<void>;
    installNow: () => Promise<void>;
    onCheckingForUpdate: (callback: () => void) => () => void;
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string | null; releaseDate: string }) => void) => () => void;
    onUpdateNotAvailable: (callback: () => void) => () => void;
    onDownloadProgress: (callback: (progress: { bytesPerSecond: number; percent: number; transferred: number; total: number }) => void) => () => void;
    onUpdateDownloaded: (callback: (info: { version: string; releaseNotes: string | null; releaseDate: string }) => void) => () => void;
    onUpdateError: (callback: (message: string) => void) => () => void;
  };
  radio: {
    favorites: {
      getAll: () => Promise<unknown[]>;
      add: (station: {
        stationUuid: string;
        name: string;
        url: string;
        urlResolved: string;
        homepage?: string;
        favicon?: string;
        country?: string;
        countryCode?: string;
        language?: string;
        codec?: string;
        bitrate?: number;
        tags?: string;
      }) => Promise<unknown>;
      remove: (stationUuid: string) => Promise<void>;
      isFavorite: (stationUuid: string) => Promise<boolean>;
    };
  };
  shell: {
    showInFolder: (filePath: string) => Promise<void>;
    trashFile: (filePath: string) => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
  };
  playlist: {
    extract: (url: string) => Promise<SearchResult[]>;
    cancel: () => Promise<void>;
    onExtractProgress: (callback: (data: {
      current: number;
      total: number;
      trackName: string;
    }) => void) => () => void;
  };
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) => Promise<T>;
  };
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
