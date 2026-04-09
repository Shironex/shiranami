import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function createIpcListener<T>(channel: string): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void) => {
    const handler = (_event: IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

const UPDATER_IPC_CHANNELS = new Set([
  'updater:check-for-updates',
  'updater:start-download',
  'updater:install-now',
]);

const ALLOWED_IPC_CHANNELS = new Set([
  'window:is-maximized',
  'window:set-always-on-top',
  'window:set-compact-mode',
  'store:get',
  'store:set',
  'store:delete',
  'app:get-version',
  'app:open-logs-folder',
  'dialog:open-directory',
  'dialog:open-file',
  'library:parse-metadata',
  'library:scan-folder',
  'library:scan-folder-grouped',
  'library:validate-files',
  'lyrics:fetch',
  'db:tracks:get-all',
  'db:tracks:add',
  'db:tracks:add-many',
  'db:tracks:remove',
  'db:tracks:remove-many',
  'db:tracks:update',
  'db:tracks:update-many',
  'db:tracks:toggle-favorite',
  'db:tracks:get-favorites',
  'db:tracks:increment-play-count',
  'db:tracks:exists',
  'db:tracks:exists-many',
  'db:history:record-play',
  'db:history:get-recent',
  'db:history:get-summary',
  'db:history:get-activity',
  'db:folders:get-all',
  'db:folders:add',
  'db:folders:remove',
  'db:folders:update-scanned',
  'db:playlists:get-all',
  'db:playlists:get',
  'db:playlists:create',
  'db:playlists:create-with-tracks',
  'db:playlists:update',
  'db:playlists:delete',
  'db:playlists:get-tracks',
  'db:playlists:add-track',
  'db:playlists:remove-track',
  'db:playlists:get-playlists-for-tracks',
  'db:playlists:reorder',
  'shell:show-in-folder',
  'shell:trash-file',
  'downloader:check',
  'downloader:get-download-location',
  'downloader:set-download-location',
  'downloader:check-dependencies',
  'downloader:search',
  'downloader:suggest',
  'downloader:download',
  'downloader:install-ytdlp',
  'downloader:get-ytdlp-path',
  'downloader:check-ffmpeg',
  'downloader:install-ffmpeg',
  'downloader:get-stream-url',
  'downloader:install-dependencies',
  'radio:favorites:get-all',
  'radio:favorites:add',
  'radio:favorites:remove',
  'radio:favorites:is-favorite',
  'playlist:extract',
  'playlist:cancel',
  'share:track',
  'share:playlist',
  'share:import',
  'share:cache-youtube-id',
  'metadata:lookup',
  'metadata:enrich-tracks',
  'metadata:enrich-cancel',
]);

function assertAllowedChannel(channel: string): void {
  if (!ALLOWED_IPC_CHANNELS.has(channel) && !UPDATER_IPC_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: "${channel}"`);
  }
}

function invokeWithTimeout<T>(channel: string, timeout: number, ...args: unknown[]): Promise<T> {
  assertAllowedChannel(channel);
  const invokePromise = ipcRenderer.invoke(channel, ...args) as Promise<T>;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`IPC timeout: "${channel}" did not respond within ${timeout}ms`));
      invokePromise.catch(() => {});
    }, timeout);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  });
  return Promise.race([invokePromise.finally(() => clearTimeout(timer)), timeoutPromise]);
}

interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  albumArt: string | null;
}

interface ListeningHistoryEntry {
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

interface ListeningStatsTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  playCount: number;
  listenedSeconds: number;
  lastPlayedAt: string;
}

interface ListeningStatsArtist {
  artist: string;
  playCount: number;
  listenedSeconds: number;
}

interface ListeningStatsSummary {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
  completedPlays: number;
  topTracks: ListeningStatsTrack[];
  topArtists: ListeningStatsArtist[];
}

interface ListeningActivityPoint {
  date: string;
  playCount: number;
  listenedMinutes: number;
}

export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
    setCompactMode: (compactMode: boolean) => Promise<void>;
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
  app: {
    getVersion: () => Promise<string>;
    openLogsFolder: () => Promise<void>;
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
    folders: {
      getAll: () => Promise<unknown[]>;
      add: (path: string) => Promise<unknown>;
      remove: (id: string) => Promise<void>;
      updateScanned: (id: string) => Promise<unknown>;
    };
    playlists: {
      getAll: () => Promise<unknown[]>;
      get: (id: string) => Promise<unknown>;
      create: (data: { name: string; description?: string; coverArt?: string }) => Promise<unknown>;
      createWithTracks: (data: { name: string; description?: string; trackIds: string[] }) => Promise<unknown>;
      update: (id: string, data: { name?: string; description?: string; coverArt?: string }) => Promise<unknown>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<unknown[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
      getPlaylistsForTracks: (trackIds: string[]) => Promise<string[]>;
      reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
    };
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
  downloader: {
    getStreamUrl: (url: string) => Promise<string>;
    suggest: (query: string) => Promise<string[]>;
    search: (query: string) => Promise<Array<{
      id: string;
      title: string;
      uploader: string;
      duration: number;
      thumbnail: string;
      url: string;
      webpage_url: string;
    }>>;
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
      ytdlp: { installed: boolean; version?: string; latestVersion?: string; updateAvailable?: boolean };
      ffmpeg: { installed: boolean; version?: string; latestVersion?: string; updateAvailable?: boolean };
      ytdlpPath: string;
      downloadLocation: { path: string; defaultPath: string; isDefault: boolean };
      timestamp: number;
    } | null>;
    refreshToolStatus: () => Promise<{
      ytdlp: { installed: boolean; version?: string; latestVersion?: string; updateAvailable?: boolean };
      ffmpeg: { installed: boolean; version?: string; latestVersion?: string; updateAvailable?: boolean };
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
    onProgress: (callback: (data: {
      url: string;
      progress: number;
      status: 'downloading' | 'converting' | 'done' | 'error';
      error?: string;
    }) => void) => () => void;
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
  shell: {
    showInFolder: (filePath: string) => Promise<void>;
    trashFile: (filePath: string) => Promise<void>;
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
  playlist: {
    extract: (url: string) => Promise<Array<{
      id: string;
      title: string;
      uploader: string;
      duration: number;
      thumbnail: string;
      url: string;
      webpage_url: string;
    }>>;
    cancel: () => Promise<void>;
    onExtractProgress: (callback: (data: {
      current: number;
      total: number;
      trackName: string;
    }) => void) => () => void;
  };
  metadata: {
    lookup: (title: string, artist: string) => Promise<{
      title?: string;
      artist?: string;
      album?: string;
      genre?: string;
      year?: number;
      trackNumber?: number;
      coverImageUrl?: string;
      source: 'itunes' | 'youtube' | 'none';
      confidence: number;
    }>;
    enrichTracks: (
      tracks: Array<{
        id: string;
        filePath: string;
        title: string;
        artist: string;
        album: string;
        albumArt: string | null;
        genre: string;
        year: number | null;
        trackNumber: number | null;
      }>,
      options: { writeToFile: boolean; onlyMissing: boolean }
    ) => Promise<Array<{
      id: string;
      success: boolean;
      updatedFields: Partial<{
        title: string;
        artist: string;
        album: string;
        genre: string;
        year: number;
        trackNumber: number;
        albumArt: string;
      }>;
      source: string;
      error?: string;
    }>>;
    cancelEnrichment: () => Promise<void>;
    onEnrichProgress: (callback: (data: {
      current: number;
      total: number;
      trackName: string;
      status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
    }) => void) => () => void;
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
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) => Promise<T>;
  };
  platform: NodeJS.Platform;
}

const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    setAlwaysOnTop: (alwaysOnTop: boolean) =>
      ipcRenderer.invoke('window:set-always-on-top', alwaysOnTop),
    setCompactMode: (compactMode: boolean) =>
      ipcRenderer.invoke('window:set-compact-mode', compactMode),
    onMaximizedChange: createIpcListener<boolean>('window:maximized-change'),
  },
  store: {
    get: <T>(key: string) => ipcRenderer.invoke('store:get', key) as Promise<T | undefined>,
    set: <T>(key: string, value: T) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    openFile: (options?: unknown) => ipcRenderer.invoke('dialog:open-file', options),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder'),
  },
  library: {
    parseMetadata: (filePath: string) => ipcRenderer.invoke('library:parse-metadata', filePath),
    scanFolder: (dirPath: string) => ipcRenderer.invoke('library:scan-folder', dirPath),
    scanFolderGrouped: (dirPath: string) => ipcRenderer.invoke('library:scan-folder-grouped', dirPath),
    validateFiles: (filePaths: string[]) => ipcRenderer.invoke('library:validate-files', filePaths) as Promise<string[]>,
  },
  db: {
    tracks: {
      getAll: () => ipcRenderer.invoke('db:tracks:get-all'),
      add: (track: unknown) => ipcRenderer.invoke('db:tracks:add', track),
      addMany: (tracks: unknown[]) => ipcRenderer.invoke('db:tracks:add-many', tracks),
      remove: (id: string) => ipcRenderer.invoke('db:tracks:remove', id),
      removeMany: (ids: string[]) => ipcRenderer.invoke('db:tracks:remove-many', ids),
      update: (id: string, data: unknown) => ipcRenderer.invoke('db:tracks:update', id, data),
      updateMany: (updates: Array<{ id: string; data: unknown }>) => ipcRenderer.invoke('db:tracks:update-many', updates),
      toggleFavorite: (id: string) => ipcRenderer.invoke('db:tracks:toggle-favorite', id),
      getFavorites: () => ipcRenderer.invoke('db:tracks:get-favorites'),
      incrementPlayCount: (id: string) => ipcRenderer.invoke('db:tracks:increment-play-count', id),
      exists: (filePath: string) => ipcRenderer.invoke('db:tracks:exists', filePath),
      existsMany: (filePaths: string[]) => ipcRenderer.invoke('db:tracks:exists-many', filePaths) as Promise<string[]>,
    },
    history: {
      recordPlay: (data: {
        trackId: string;
        playedSeconds: number;
        duration: number | null;
        source?: string;
      }) => ipcRenderer.invoke('db:history:record-play', data),
      getRecent: (options?: { limit?: number; since?: string | null }) =>
        ipcRenderer.invoke('db:history:get-recent', options),
      getSummary: (options?: { since?: string | null }) =>
        ipcRenderer.invoke('db:history:get-summary', options),
      getActivity: (options?: { since?: string | null }) =>
        ipcRenderer.invoke('db:history:get-activity', options),
    },
    folders: {
      getAll: () => ipcRenderer.invoke('db:folders:get-all'),
      add: (path: string) => ipcRenderer.invoke('db:folders:add', path),
      remove: (id: string) => ipcRenderer.invoke('db:folders:remove', id),
      updateScanned: (id: string) => ipcRenderer.invoke('db:folders:update-scanned', id),
    },
    playlists: {
      getAll: () => ipcRenderer.invoke('db:playlists:get-all'),
      get: (id: string) => ipcRenderer.invoke('db:playlists:get', id),
      create: (data: { name: string; description?: string; coverArt?: string }) =>
        ipcRenderer.invoke('db:playlists:create', data),
      createWithTracks: (data: { name: string; description?: string; trackIds: string[] }) =>
        ipcRenderer.invoke('db:playlists:create-with-tracks', data),
      update: (id: string, data: { name?: string; description?: string; coverArt?: string }) =>
        ipcRenderer.invoke('db:playlists:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('db:playlists:delete', id),
      getTracks: (playlistId: string) => ipcRenderer.invoke('db:playlists:get-tracks', playlistId),
      addTrack: (playlistId: string, trackId: string) =>
        ipcRenderer.invoke('db:playlists:add-track', { playlistId, trackId }),
      removeTrack: (playlistId: string, trackId: string) =>
        ipcRenderer.invoke('db:playlists:remove-track', { playlistId, trackId }),
      getPlaylistsForTracks: (trackIds: string[]) =>
        ipcRenderer.invoke('db:playlists:get-playlists-for-tracks', trackIds),
      reorder: (playlistId: string, trackIds: string[]) =>
        ipcRenderer.invoke('db:playlists:reorder', { playlistId, trackIds }),
    },
  },
  lyrics: {
    fetch: (title: string, artist: string, album?: string, duration?: number) =>
      ipcRenderer.invoke('lyrics:fetch', title, artist, album, duration),
  },
  media: {
    onCommand: createIpcListener<string>('media:command'),
    sendPlaybackState: (state) => ipcRenderer.send('media:playback-state', state),
    clearState: () => ipcRenderer.send('media:clear-state'),
  },
  downloader: {
    suggest: (query: string) => ipcRenderer.invoke('downloader:suggest', query),
    search: (query: string) => ipcRenderer.invoke('downloader:search', query),
    getStreamUrl: (url: string) => ipcRenderer.invoke('downloader:get-stream-url', url),
    download: (url: string) => ipcRenderer.invoke('downloader:download', { url }),
    getDownloadLocation: () => ipcRenderer.invoke('downloader:get-download-location'),
    setDownloadLocation: (downloadPath: string | null) =>
      ipcRenderer.invoke('downloader:set-download-location', downloadPath),
    checkDependencies: () => ipcRenderer.invoke('downloader:check-dependencies'),
    getCachedToolStatus: () => ipcRenderer.invoke('downloader:get-cached-tool-status'),
    refreshToolStatus: () => ipcRenderer.invoke('downloader:refresh-tool-status'),
    check: () => ipcRenderer.invoke('downloader:check'),
    onProgress: createIpcListener<{
      url: string;
      progress: number;
      status: 'downloading' | 'converting' | 'done' | 'error';
      error?: string;
    }>('downloader:progress'),
    installYtDlp: () => ipcRenderer.invoke('downloader:install-ytdlp'),
    onInstallProgress: createIpcListener<{ percent: number }>('downloader:install-progress'),
    getYtDlpPath: () => ipcRenderer.invoke('downloader:get-ytdlp-path'),
    checkFfmpeg: () => ipcRenderer.invoke('downloader:check-ffmpeg'),
    installFfmpeg: () => ipcRenderer.invoke('downloader:install-ffmpeg'),
    onFfmpegInstallProgress: createIpcListener<{ percent: number }>('downloader:ffmpeg-install-progress'),
    installDependencies: () => ipcRenderer.invoke('downloader:install-dependencies'),
    onDependencyInstallProgress: createIpcListener<{
      target: 'ytdlp' | 'ffmpeg';
      percent: number;
      overallPercent: number;
      label: string;
    }>('downloader:dependency-install-progress'),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    installNow: () => ipcRenderer.invoke('updater:install-now'),
    onCheckingForUpdate: createIpcListener<void>('updater:checking-for-update'),
    onUpdateAvailable: createIpcListener<{ version: string; releaseNotes: string | null; releaseDate: string }>('updater:update-available'),
    onUpdateNotAvailable: createIpcListener<void>('updater:update-not-available'),
    onDownloadProgress: createIpcListener<{ bytesPerSecond: number; percent: number; transferred: number; total: number }>('updater:download-progress'),
    onUpdateDownloaded: createIpcListener<{ version: string; releaseNotes: string | null; releaseDate: string }>('updater:update-downloaded'),
    onUpdateError: createIpcListener<string>('updater:error'),
  },
  shell: {
    showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),
    trashFile: (filePath: string) => ipcRenderer.invoke('shell:trash-file', filePath),
  },
  radio: {
    favorites: {
      getAll: () => ipcRenderer.invoke('radio:favorites:get-all'),
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
      }) => ipcRenderer.invoke('radio:favorites:add', station),
      remove: (stationUuid: string) => ipcRenderer.invoke('radio:favorites:remove', stationUuid),
      isFavorite: (stationUuid: string) =>
        ipcRenderer.invoke('radio:favorites:is-favorite', stationUuid) as Promise<boolean>,
    },
  },
  playlist: {
    extract: (url: string) => ipcRenderer.invoke('playlist:extract', url),
    cancel: () => ipcRenderer.invoke('playlist:cancel'),
    onExtractProgress: createIpcListener<{
      current: number;
      total: number;
      trackName: string;
    }>('playlist:extract-progress'),
  },
  metadata: {
    lookup: (title: string, artist: string) =>
      ipcRenderer.invoke('metadata:lookup', title, artist),
    enrichTracks: (
      tracks: Array<{
        id: string;
        filePath: string;
        title: string;
        artist: string;
        album: string;
        albumArt: string | null;
        genre: string;
        year: number | null;
        trackNumber: number | null;
      }>,
      options: { writeToFile: boolean; onlyMissing: boolean }
    ) => ipcRenderer.invoke('metadata:enrich-tracks', tracks, options),
    cancelEnrichment: () => ipcRenderer.invoke('metadata:enrich-cancel'),
    onEnrichProgress: createIpcListener<{
      current: number;
      total: number;
      trackName: string;
      status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
    }>('metadata:enrich-progress'),
  },
  share: {
    track: (trackId: string) => ipcRenderer.invoke('share:track', trackId),
    playlist: (playlistId: string) => ipcRenderer.invoke('share:playlist', playlistId),
    import: (code: string) => ipcRenderer.invoke('share:import', code),
    cacheYoutubeId: (trackId: string, youtubeId: string) => ipcRenderer.invoke('share:cache-youtube-id', trackId, youtubeId),
    onDeepLink: createIpcListener<string>('share:deep-link'),
  },
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) =>
      invokeWithTimeout<T>(channel, timeout, ...args),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
