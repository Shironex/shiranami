import type {
  EnrichTrackInput,
  EnrichTrackResult,
  EnrichProgress,
  LoudnessAnalyzeInput,
  LoudnessAnalyzeResult,
  LoudnessProgress,
  MetadataLookupResult,
  WriteTagsInput,
  WriteTagsResult,
  DbExportResult,
  DbImportResult,
  MainMetricsSnapshot,
  GeocodeResult,
  WeatherCurrent,
  RecommendationShelves,
  SimilarTrackResult,
  SmartMixResult,
  SmartMixSignals,
  ScrobbleStatus,
  LastfmConnectResult,
  ListenBrainzConnectResult,
  ShareImportResponse,
  SystemNotice,
  SmartPlaylist,
  SmartPlaylistDefinition,
  SmartPlaylistRule,
  SmartPlaylistMatchType,
  DownloadQueueSnapshot,
  EnqueueDownloadInput,
  DiskUsageResult,
  Track,
} from '@shiranami/contracts';
import type {
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
import type { DiscordRpcSettings, DiscordMusicPresenceActivity } from '@shiranami/shared';

export type { TrackMetadata, SearchResult, Track } from '@shiranami/contracts';

// Listening-history wire types are defined once in @shiranami/contracts and
// re-exported here so renderer code can keep importing them from `@/types/electron`.
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

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Row shape returned by `db.folders.*` — mirrors the `folders` table. */
export interface WatchedFolder {
  id: string;
  path: string;
  lastScanned: string | null;
  createdAt: string;
}

export interface DownloadProgress {
  url: string;
  progress: number;
  status: 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
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
  loudness: {
    analyze: (tracks: LoudnessAnalyzeInput[]) => Promise<LoudnessAnalyzeResult>;
    cancel: () => Promise<void>;
    onProgress: (callback: (data: LoudnessProgress) => void) => () => void;
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
  discord: {
    getSettings: () => Promise<DiscordRpcSettings>;
    updateSettings: (updates: Partial<DiscordRpcSettings>) => Promise<DiscordRpcSettings>;
    updatePresence: (activity: DiscordMusicPresenceActivity) => Promise<void>;
    clearPresence: () => Promise<void>;
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
  weather: {
    geocode: (query: string) => Promise<GeocodeResult | null>;
    getCurrent: (coords: { lat: number; lon: number }) => Promise<WeatherCurrent>;
  };
  db: {
    tracks: {
      getAll: () => Promise<Track[]>;
      add: (track: unknown) => Promise<Track | undefined>;
      addMany: (tracks: unknown[]) => Promise<Track[]>;
      remove: (id: string) => Promise<void>;
      removeMany: (ids: string[]) => Promise<void>;
      update: (id: string, data: unknown) => Promise<Track | undefined>;
      updateMany: (updates: Array<{ id: string; data: unknown }>) => Promise<void>;
      toggleFavorite: (id: string) => Promise<Track | undefined>;
      getFavorites: () => Promise<Track[]>;
      incrementPlayCount: (id: string) => Promise<Track | undefined>;
      exists: (filePath: string) => Promise<boolean>;
      existsMany: (filePaths: string[]) => Promise<string[]>;
      getIdByPath: (filePath: string) => Promise<string | null>;
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
      getSummary: (options?: {
        since?: string | null;
        until?: string | null;
      }) => Promise<ListeningStatsSummary>;
      getActivity: (options?: { since?: string | null }) => Promise<ListeningActivityPoint[]>;
      getHourlyActivity: (options?: {
        since?: string | null;
      }) => Promise<ListeningHourlyActivityPoint[]>;
      getWeeklyInsights: (options?: { since?: string | null }) => Promise<WeeklyInsights>;
    };
    playlists: {
      getAll: () => Promise<Playlist[]>;
      get: (id: string) => Promise<Playlist | undefined>;
      create: (data: {
        name: string;
        description?: string;
        coverArt?: string;
      }) => Promise<Playlist | undefined>;
      createWithTracks: (data: {
        name: string;
        description?: string;
        trackIds: string[];
      }) => Promise<Playlist | undefined>;
      update: (
        id: string,
        data: { name?: string; description?: string; coverArt?: string }
      ) => Promise<Playlist | undefined>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<Track[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      addTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
      removeTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
      getPlaylistsForTracks: (trackIds: string[]) => Promise<string[]>;
      reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
    };
    smartPlaylists: {
      getAll: () => Promise<SmartPlaylist[]>;
      get: (id: string) => Promise<SmartPlaylist | null>;
      create: (data: {
        name: string;
        description?: string;
        matchType: SmartPlaylistMatchType;
        rules: SmartPlaylistRule[];
      }) => Promise<SmartPlaylist>;
      update: (
        id: string,
        data: {
          name?: string;
          description?: string;
          matchType?: SmartPlaylistMatchType;
          rules?: SmartPlaylistRule[];
        }
      ) => Promise<SmartPlaylist | null>;
      delete: (id: string) => Promise<void>;
      getTracks: (id: string) => Promise<Track[]>;
      preview: (definition: SmartPlaylistDefinition) => Promise<Track[]>;
    };
    folders: {
      getAll: () => Promise<WatchedFolder[]>;
      add: (path: string) => Promise<WatchedFolder | undefined>;
      remove: (id: string) => Promise<void>;
      updateScanned: (id: string) => Promise<WatchedFolder | undefined>;
    };
    backup: {
      export: () => Promise<DbExportResult>;
      import: () => Promise<DbImportResult>;
    };
  };
  downloader: {
    getStreamUrl: (url: string) => Promise<string>;
    suggest: (query: string) => Promise<string[]>;
    search: (query: string) => Promise<SearchResult[]>;
    download: (url: string) => Promise<string>;
    enqueueDownload: (input: EnqueueDownloadInput) => Promise<string>;
    cancelDownload: (id: string) => Promise<void>;
    cancelAllDownloads: () => Promise<void>;
    clearCompletedDownloads: () => Promise<void>;
    pauseDownloadQueue: () => Promise<void>;
    resumeDownloadQueue: () => Promise<void>;
    markDownloadsImported: (ids: string[]) => Promise<void>;
    getDownloadQueue: () => Promise<DownloadQueueSnapshot>;
    onQueueState: (callback: (snapshot: DownloadQueueSnapshot) => void) => () => void;
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
    getLocaleCountry: () => Promise<string>;
  };
  playlist: {
    extract: (url: string) => Promise<{ title: string | null; tracks: SearchResult[] }>;
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
    writeTags: (input: WriteTagsInput) => Promise<WriteTagsResult>;
  };
  share: {
    track: (trackId: string) => Promise<{ code: string; url: string; expiresAt: string }>;
    playlist: (playlistId: string) => Promise<{ code: string; url: string; expiresAt: string }>;
    import: (code: string) => Promise<ShareImportResponse>;
    cacheYoutubeId: (trackId: string, youtubeId: string) => Promise<void>;
    onDeepLink: (callback: (code: string) => void) => () => void;
  };
  debug: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    onMetrics: (callback: (snapshot: MainMetricsSnapshot) => void) => () => void;
  };
  recommendations: {
    get: () => Promise<RecommendationShelves>;
    refresh: () => Promise<RecommendationShelves>;
    similar: (seedTrackId: string) => Promise<SimilarTrackResult[]>;
    notInterested: (trackId: string) => Promise<void>;
    undoNotInterested: (trackId: string) => Promise<void>;
    smartMixes: (signals: SmartMixSignals) => Promise<SmartMixResult[]>;
  };
  scrobble: {
    getStatus: () => Promise<ScrobbleStatus>;
    setEnabled: (enabled: boolean) => Promise<ScrobbleStatus>;
    lastfmBeginAuth: () => Promise<{ ok: boolean; token?: string; error?: string }>;
    lastfmCompleteAuth: (token: string) => Promise<LastfmConnectResult>;
    lastfmDisconnect: () => Promise<ScrobbleStatus>;
    listenBrainzConnect: (token: string) => Promise<ListenBrainzConnectResult>;
    listenBrainzDisconnect: () => Promise<ScrobbleStatus>;
  };
  system: {
    onNotice: (callback: (notice: SystemNotice) => void) => () => void;
  };
  storage: {
    getUsage: (folderPaths: string[]) => Promise<DiskUsageResult>;
  };
  errors: {
    isIpcError: (e: unknown) => e is { code: string; message: string; details?: unknown };
    SHARE_ERROR_CODES: typeof SHARE_ERROR_CODES;
    PLAYLIST_ERROR_CODES: typeof PLAYLIST_ERROR_CODES;
    VALIDATION_ERROR_CODES: typeof VALIDATION_ERROR_CODES;
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
