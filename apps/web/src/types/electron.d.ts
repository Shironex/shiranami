import type {
  EnrichTrackInput,
  EnrichTrackResult,
  EnrichProgress,
  MetadataLookupResult,
  MainMetricsSnapshot,
} from '@shiranami/contracts';

export type { TrackMetadata, SearchResult } from '@shiranami/contracts';

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
}

export interface ListeningHistoryEntry {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  duration: number | null;
  playedAt: string;
  playedSeconds: number;
  completionRatio: number;
  completed: boolean;
  source: string;
}

export interface ListeningStatsTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  playCount: number;
  listenedSeconds: number;
  lastPlayedAt: string;
}

export interface ListeningStatsArtist {
  artist: string;
  playCount: number;
  listenedSeconds: number;
}

export interface ListeningStatsSummary {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
  completedPlays: number;
  topTracks: ListeningStatsTrack[];
  topArtists: ListeningStatsArtist[];
}

export interface ListeningActivityPoint {
  date: string;
  playCount: number;
  listenedMinutes: number;
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
    setCompactMode: (
      compactMode: boolean,
      dimensions?: { width: number; height: number }
    ) => Promise<void>;
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
    scanFolder: (dirPath: string) => Promise<Array<{ filePath: string; metadata: TrackMetadata }>>;
    scanFolderGrouped: (dirPath: string) => Promise<{
      rootTracks: Array<{ filePath: string; metadata: TrackMetadata }>;
      subfolders: Array<{
        name: string;
        path: string;
        tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
      }>;
    }>;
    validateFiles: (filePaths: string[]) => Promise<string[]>;
    onScanProgress: (
      handler: (event: {
        filePath: string;
        fileIndex: number;
        fileCount: number;
        ok: boolean;
      }) => void
    ) => () => void;
    cancelScan: () => Promise<void>;
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
    }) => Promise<void>;
    clearState: () => Promise<void>;
  };
  lyrics: {
    fetch: (
      title: string,
      artist: string,
      album?: string,
      duration?: number
    ) => Promise<{
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
      updateMany: (updates: Array<{ id: string; data: unknown }>) => Promise<unknown[]>;
      toggleFavorite: (id: string) => Promise<unknown>;
      getFavorites: () => Promise<unknown[]>;
      incrementPlayCount: (id: string) => Promise<unknown>;
      exists: (filePath: string) => Promise<boolean>;
      existsMany: (filePaths: string[]) => Promise<string[]>;
    };
    history: {
      recordPlay: (data: {
        trackId: string;
        playedSeconds: number;
        duration: number | null;
        source?: string;
      }) => Promise<unknown>;
      getRecent: (options?: {
        limit?: number;
        since?: string | null;
      }) => Promise<ListeningHistoryEntry[]>;
      getSummary: (options?: { since?: string | null }) => Promise<ListeningStatsSummary>;
      getActivity: (options?: { since?: string | null }) => Promise<ListeningActivityPoint[]>;
    };
    playlists: {
      getAll: () => Promise<unknown[]>;
      get: (id: string) => Promise<unknown>;
      create: (data: { name: string; description?: string; coverArt?: string }) => Promise<unknown>;
      createWithTracks: (data: {
        name: string;
        description?: string;
        trackIds: string[];
      }) => Promise<Playlist>;
      update: (
        id: string,
        data: { name?: string; description?: string; coverArt?: string }
      ) => Promise<unknown>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<unknown[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
      getPlaylistsForTracks: (trackIds: string[]) => Promise<string[]>;
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
    suggest: (query: string) => Promise<string[]>;
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
    getCachedToolStatus: () => Promise<{
      ytdlp: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ffmpeg: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ytdlpPath: string;
      downloadLocation: { path: string; defaultPath: string; isDefault: boolean };
      timestamp: number;
    } | null>;
    refreshToolStatus: () => Promise<{
      ytdlp: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ffmpeg: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ytdlpPath: string;
      downloadLocation: { path: string; defaultPath: string; isDefault: boolean };
      timestamp: number;
    } | null>;
    check: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    onProgress: (callback: (data: DownloadProgress) => void) => () => void;
    installYtDlp: () => Promise<void>;
    onInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    getYtDlpPath: () => Promise<string>;
    checkFfmpeg: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    installFfmpeg: () => Promise<void>;
    onFfmpegInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    installDependencies: () => Promise<{
      results: Array<{ tool: 'ytdlp' | 'ffmpeg'; success: boolean; error?: string }>;
    }>;
    onDependencyInstallProgress: (
      callback: (progress: {
        target: 'ytdlp' | 'ffmpeg';
        percent: number;
        overallPercent: number;
        label: string;
      }) => void
    ) => () => void;
  };
  updater: {
    checkForUpdates: () => Promise<{ enabled: boolean }>;
    startDownload: () => Promise<void>;
    installNow: () => Promise<void>;
    onCheckingForUpdate: (callback: () => void) => () => void;
    onUpdateAvailable: (
      callback: (info: {
        version: string;
        releaseNotes: string | null;
        releaseDate: string;
      }) => void
    ) => () => void;
    onUpdateNotAvailable: (callback: () => void) => () => void;
    onDownloadProgress: (
      callback: (progress: {
        bytesPerSecond: number;
        percent: number;
        transferred: number;
        total: number;
      }) => void
    ) => () => void;
    onUpdateDownloaded: (
      callback: (info: {
        version: string;
        releaseNotes: string | null;
        releaseDate: string;
      }) => void
    ) => () => void;
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
    openLogsFolder: () => Promise<void>;
  };
  playlist: {
    extract: (url: string) => Promise<SearchResult[]>;
    cancel: () => Promise<void>;
    onExtractProgress: (
      callback: (data: { current: number; total: number; trackName: string }) => void
    ) => () => void;
  };
  metadata: {
    lookup: (title: string, artist: string) => Promise<MetadataLookupResult>;
    enrichTracks: (
      tracks: EnrichTrackInput[],
      options: { writeToFile: boolean; onlyMissing: boolean }
    ) => Promise<EnrichTrackResult[]>;
    previewEnrich: (
      track: EnrichTrackInput,
      options: { onlyMissing: boolean }
    ) => Promise<EnrichTrackResult>;
    cancelEnrichment: () => Promise<void>;
    onEnrichProgress: (callback: (data: EnrichProgress) => void) => () => void;
  };
  share: {
    track: (trackId: string) => Promise<{ code: string; url: string; expiresAt: string }>;
    playlist: (playlistId: string) => Promise<{ code: string; url: string; expiresAt: string }>;
    import: (code: string) => Promise<{
      type: 'TRACK' | 'PLAYLIST';
      payload: unknown;
      code: string;
      expiresAt: string;
    }>;
    cacheYoutubeId: (trackId: string, youtubeId: string) => Promise<void>;
    onDeepLink: (callback: (code: string) => void) => () => void;
  };
  debug: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    onMetrics: (callback: (snapshot: MainMetricsSnapshot) => void) => () => void;
  };
  platform: NodeJS.Platform;
  /** True when the main process was launched with SHIRANAMI_E2E=1. */
  __e2e: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
