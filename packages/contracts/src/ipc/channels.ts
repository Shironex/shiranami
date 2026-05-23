// Manifest of every IPC channel exchanged between desktop main and renderer.
//
// `invoke` channels are renderer→main, registered via `ipcMain.handle` and
// called from the renderer through `ipcRenderer.invoke`. `event` channels are
// main→renderer, sent via `webContents.send` and received with
// `ipcRenderer.on`. Keep both shapes in sync with the actual handlers in
// apps/desktop/src/main/.
//
// Adding a channel here does not register it; that still lives in the
// per-domain handler modules. The preload `ALLOWED_IPC_CHANNELS` allowlist is
// derived from `ALL_IPC_CHANNELS`, so a new channel only needs to be added here.

export const IPC_CHANNELS = {
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized',
    setAlwaysOnTop: 'window:set-always-on-top',
    setCompactMode: 'window:set-compact-mode',
    maximizedChange: 'window:maximized-change',
  },
  app: {
    getVersion: 'app:get-version',
    openLogsFolder: 'app:open-logs-folder',
  },
  debug: {
    start: 'debug:start',
    stop: 'debug:stop',
    metrics: 'debug:metrics',
  },
  store: {
    get: 'store:get',
    set: 'store:set',
    delete: 'store:delete',
  },
  dialog: {
    openDirectory: 'dialog:open-directory',
    openFile: 'dialog:open-file',
  },
  shell: {
    showInFolder: 'shell:show-in-folder',
    trashFile: 'shell:trash-file',
  },
  media: {
    playbackState: 'media:playback-state',
    clearState: 'media:clear-state',
    command: 'media:command',
  },
  discord: {
    getSettings: 'discord-rpc:get-settings',
    updateSettings: 'discord-rpc:update-settings',
    updatePresence: 'discord-rpc:update-presence',
    clearPresence: 'discord-rpc:clear-presence',
  },
  library: {
    parseMetadata: 'library:parse-metadata',
    scanFolder: 'library:scan-folder',
    scanFolderGrouped: 'library:scan-folder-grouped',
    validateFiles: 'library:validate-files',
    scanProgress: 'library:scan-progress',
    scanCancel: 'library:scan-cancel',
  },
  lyrics: {
    fetch: 'lyrics:fetch',
  },
  weather: {
    geocode: 'weather:geocode',
    getCurrent: 'weather:get-current',
  },
  db: {
    tracks: {
      getAll: 'db:tracks:get-all',
      add: 'db:tracks:add',
      addMany: 'db:tracks:add-many',
      remove: 'db:tracks:remove',
      removeMany: 'db:tracks:remove-many',
      update: 'db:tracks:update',
      updateMany: 'db:tracks:update-many',
      toggleFavorite: 'db:tracks:toggle-favorite',
      getFavorites: 'db:tracks:get-favorites',
      incrementPlayCount: 'db:tracks:increment-play-count',
      exists: 'db:tracks:exists',
      existsMany: 'db:tracks:exists-many',
    },
    history: {
      recordPlay: 'db:history:record-play',
      getRecent: 'db:history:get-recent',
      getSummary: 'db:history:get-summary',
      getActivity: 'db:history:get-activity',
      getHourlyActivity: 'db:history:get-hourly-activity',
      getWeeklyInsights: 'db:history:get-weekly-insights',
    },
    folders: {
      getAll: 'db:folders:get-all',
      add: 'db:folders:add',
      remove: 'db:folders:remove',
      updateScanned: 'db:folders:update-scanned',
    },
    playlists: {
      getAll: 'db:playlists:get-all',
      get: 'db:playlists:get',
      create: 'db:playlists:create',
      createWithTracks: 'db:playlists:create-with-tracks',
      update: 'db:playlists:update',
      delete: 'db:playlists:delete',
      getTracks: 'db:playlists:get-tracks',
      addTrack: 'db:playlists:add-track',
      removeTrack: 'db:playlists:remove-track',
      getPlaylistsForTracks: 'db:playlists:get-playlists-for-tracks',
      reorder: 'db:playlists:reorder',
    },
  },
  downloader: {
    check: 'downloader:check',
    getDownloadLocation: 'downloader:get-download-location',
    setDownloadLocation: 'downloader:set-download-location',
    checkDependencies: 'downloader:check-dependencies',
    getCachedToolStatus: 'downloader:get-cached-tool-status',
    refreshToolStatus: 'downloader:refresh-tool-status',
    search: 'downloader:search',
    suggest: 'downloader:suggest',
    download: 'downloader:download',
    getStreamUrl: 'downloader:get-stream-url',
    installYtdlp: 'downloader:install-ytdlp',
    getYtdlpPath: 'downloader:get-ytdlp-path',
    checkFfmpeg: 'downloader:check-ffmpeg',
    installFfmpeg: 'downloader:install-ffmpeg',
    installDependencies: 'downloader:install-dependencies',
    progress: 'downloader:progress',
    installProgress: 'downloader:install-progress',
    ffmpegInstallProgress: 'downloader:ffmpeg-install-progress',
    dependencyInstallProgress: 'downloader:dependency-install-progress',
  },
  radio: {
    favorites: {
      getAll: 'radio:favorites:get-all',
      add: 'radio:favorites:add',
      remove: 'radio:favorites:remove',
      isFavorite: 'radio:favorites:is-favorite',
    },
  },
  playlist: {
    extract: 'playlist:extract',
    cancel: 'playlist:cancel',
    extractProgress: 'playlist:extract-progress',
  },
  metadata: {
    lookup: 'metadata:lookup',
    enrichTracks: 'metadata:enrich:tracks',
    enrichPreview: 'metadata:enrich:preview',
    enrichCancel: 'metadata:enrich:cancel',
    enrichProgress: 'metadata:enrich:progress',
  },
  share: {
    track: 'share:track',
    playlist: 'share:playlist',
    import: 'share:import',
    cacheYoutubeId: 'share:cache-youtube-id',
    deepLink: 'share:deep-link',
  },
  updater: {
    checkForUpdates: 'updater:check-for-updates',
    startDownload: 'updater:start-download',
    installNow: 'updater:install-now',
    checkingForUpdate: 'updater:checking-for-update',
    updateAvailable: 'updater:update-available',
    updateNotAvailable: 'updater:update-not-available',
    downloadProgress: 'updater:download-progress',
    updateDownloaded: 'updater:update-downloaded',
    error: 'updater:error',
  },
} as const;

/** Recursively extract every string-leaf value from a nested const object. */
type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? { [K in keyof T]: LeafValues<T[K]> }[keyof T]
    : never;

/** Union of every channel name in the manifest. */
export type IpcChannelName = LeafValues<typeof IPC_CHANNELS>;

function collectChannels(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      collectChannels(value, out);
    }
  }
}

/**
 * Flat list of every channel in the manifest. The preload
 * `ALLOWED_IPC_CHANNELS` allowlist is derived from this rather than
 * hand-maintained as a parallel list.
 */
export const ALL_IPC_CHANNELS: readonly IpcChannelName[] = (() => {
  const channels: string[] = [];
  collectChannels(IPC_CHANNELS, channels);
  return Object.freeze(channels) as readonly IpcChannelName[];
})();
