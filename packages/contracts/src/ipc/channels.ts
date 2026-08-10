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
    getLocaleCountry: 'app:get-locale-country',
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
  scrobble: {
    // Read the connection status (booleans + display name only; never secrets).
    getStatus: 'scrobble:get-status',
    // Toggle the master opt-in switch.
    setEnabled: 'scrobble:set-enabled',
    // Last.fm: start desktop auth (open the browser) and finish it (exchange
    // the token for a session key), then disconnect.
    lastfmBeginAuth: 'scrobble:lastfm-begin-auth',
    lastfmCompleteAuth: 'scrobble:lastfm-complete-auth',
    lastfmDisconnect: 'scrobble:lastfm-disconnect',
    // ListenBrainz: validate + store a user token, then disconnect.
    listenBrainzConnect: 'scrobble:listenbrainz-connect',
    listenBrainzDisconnect: 'scrobble:listenbrainz-disconnect',
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
    // Write-back (v2-only): fetch synced lyrics for a set of tracks and save
    // each as a `.lrc` beside its audio file, so they survive going offline.
    // Gated on the `lyrics.saveFetchedLyrics` opt-in; never overwrites a lyric
    // file the user already has.
    saveBatch: 'lyrics:save-batch',
    saveCancel: 'lyrics:save-cancel',
    saveProgress: 'lyrics:save-progress',
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
      getIdByPath: 'db:tracks:get-id-by-path',
      search: 'db:tracks:search',
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
      addTracks: 'db:playlists:add-tracks',
      removeTrack: 'db:playlists:remove-track',
      removeTracks: 'db:playlists:remove-tracks',
      getPlaylistsForTracks: 'db:playlists:get-playlists-for-tracks',
      reorder: 'db:playlists:reorder',
    },
    smartPlaylists: {
      getAll: 'db:smart-playlists:get-all',
      get: 'db:smart-playlists:get',
      create: 'db:smart-playlists:create',
      update: 'db:smart-playlists:update',
      delete: 'db:smart-playlists:delete',
      // Evaluate a saved smart playlist's rules and return matching tracks.
      getTracks: 'db:smart-playlists:get-tracks',
      // Evaluate an unsaved rule definition (live preview in the editor).
      preview: 'db:smart-playlists:preview',
    },
    backup: {
      // Export a consistent copy of the library DB to a user-chosen file, and
      // restore the library from a user-chosen backup. Both run a native file
      // dialog in the main process and return a status.
      export: 'db:backup:export',
      import: 'db:backup:import',
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
    // Download-queue manager (persisted main-process queue with concurrency).
    enqueue: 'downloader:queue-enqueue',
    cancel: 'downloader:queue-cancel',
    cancelAll: 'downloader:queue-cancel-all',
    clearCompleted: 'downloader:queue-clear-completed',
    pause: 'downloader:queue-pause',
    resume: 'downloader:queue-resume',
    markImported: 'downloader:queue-mark-imported',
    getQueue: 'downloader:queue-get',
    queueState: 'downloader:queue-state',
    // Legacy per-URL download + progress (kept for direct callers; the feature
    // hooks now route through the queue above).
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
    // Manual tag editor: write user-edited tags back to the file and update the
    // DB row. Distinct from the automatic enrichment flow above.
    writeTags: 'metadata:write-tags',
  },
  analysis: {
    // One-pass analysis engine (F1/F2, v2-only): a single decode per track
    // feeds waveform peaks, loudness and tempo/key; results persist on the
    // track row. The batch skips tracks that already carry everything.
    analyze: 'analysis:analyze',
    cancel: 'analysis:cancel',
    progress: 'analysis:progress',
  },
  doctor: {
    // The Library Doctor (F8, v2-only): decode-truth health findings —
    // truncation, damaged packets, duration lies, clipping, silence.
    scan: 'doctor:scan',
    cancel: 'doctor:cancel',
    progress: 'doctor:progress',
  },
  companion: {
    // The desk companion's ledger (v2-only): singleton state hatched from
    // play history, the naming ceremony, and the Shio/Hotaru switch. The
    // event streams XP accrued by db:history:record-play.
    getState: 'companion:get-state',
    setName: 'companion:set-name',
    setSpecies: 'companion:set-species',
    xp: 'companion:xp',
  },
  loudness: {
    // Batch loudness analysis (EBU R128 / ReplayGain) via ffmpeg loudnorm.
    // Measures integrated loudness per track and persists it on the DB row.
    analyze: 'loudness:analyze',
    cancel: 'loudness:cancel',
    progress: 'loudness:progress',
  },
  waveform: {
    // Decode a local audio file (.wav/.flac/.mp3) to fixed-length peak
    // amplitudes for the player's waveform seekbar, via the native addon.
    // Cached on disk content-addressed by path + mtime + size.
    getPeaks: 'waveform:get-peaks',
  },
  recommendations: {
    // Renderer-facing reads. `get` returns both shelves from the cache;
    // `refresh` runs the background job (affinity + yt-dlp RD-mix) and returns
    // the freshly-cached shelves. The renderer never spawns yt-dlp itself.
    get: 'recommendations:get',
    refresh: 'recommendations:refresh',
    // "More like this" / song-radio: rank existing library tracks by content
    // similarity to a seed track id (offline; @shiranami/recommendation core).
    similar: 'recommendations:similar',
    // Negative signal: mark a track "Not interested" so the affinity engine
    // drops it (and softly downranks its artist). Idempotent per track.
    notInterested: 'recommendations:not-interested',
    // Undo a "Not interested" mark (removes the negative signal for a track).
    undoNotInterested: 'recommendations:undo-not-interested',
    // Smart mixes: generate mood/activity/decade mixes from the renderer's
    // contextual signals (hour + optional weather) and library metadata.
    smartMixes: 'recommendations:smart-mixes',
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
  system: {
    // Main→renderer: structured notice for silent subsystem failures (Discord
    // RPC login, album-art prune, etc.) so they surface as a calm toast instead
    // of being swallowed in the logs.
    notice: 'system:notice',
  },
  storage: {
    // Renderer→main: compute how much disk the watched library folders occupy
    // and how much free space each host volume has. Returns one entry per
    // physical volume (folders are bucketed by device id / drive root).
    getUsage: 'storage:get-usage',
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

/**
 * Channels born in v2 with no v1 counterpart. They live in the manifest tree
 * above so consumers address them normally, but they are NOT part of the
 * frozen 155-channel port surface: the v1 Electron preload implements them as
 * optional members and the renderer feature-detects. The Rust era pin
 * (`events.rs` / the registry counts) parses this list — a v2-born channel
 * missing here, or a v1 channel appearing here, fails the build's era tests.
 */
export const V2_ONLY_CHANNELS = [
  'analysis:analyze',
  'analysis:cancel',
  'analysis:progress',
  'db:tracks:search',
  'doctor:scan',
  'doctor:cancel',
  'doctor:progress',
  'companion:get-state',
  'companion:set-name',
  'companion:set-species',
  'companion:xp',
  'lyrics:save-batch',
  'lyrics:save-cancel',
  'lyrics:save-progress',
] as const;
