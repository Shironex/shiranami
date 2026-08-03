/**
 * Where each IPC channel lives on the shim — v1's 155 plus v2's own
 * (`db:tracks:search`).
 *
 * This is the drift guard, and its type does half the work on its own:
 * `Record<IpcChannelName, ChannelPath>` is keyed by the union of every leaf in
 * `@shiranami/contracts`' channel manifest, so a channel added there and not
 * implemented here fails to compile, and a key here that is not a real channel
 * fails to compile too. Neither direction is a test that has to be remembered.
 *
 * The runtime half — that each path actually resolves to a function on the built
 * surface, and that no function on the surface is missing from this table — is
 * `bridge.contract.test.ts`. Together they answer the question v1's preload
 * allowlist got wrong for seven channels while looking right: is the thing that
 * claims to cover the manifest actually covering it?
 */

import type { IpcChannelName } from '@shiranami/contracts';

/** A property path into the composed `electronAPI` object. */
export type ChannelPath = readonly string[];

export const CHANNEL_IMPLEMENTATIONS: Record<IpcChannelName, ChannelPath> = {
  // ── window ──────────────────────────────────────────────────────────────
  'window:minimize': ['window', 'minimize'],
  'window:maximize': ['window', 'maximize'],
  'window:close': ['window', 'close'],
  'window:is-maximized': ['window', 'isMaximized'],
  'window:set-always-on-top': ['window', 'setAlwaysOnTop'],
  'window:set-compact-mode': ['window', 'setCompactMode'],
  'window:maximized-change': ['window', 'onMaximizedChange'],

  // ── app ─────────────────────────────────────────────────────────────────
  'app:get-version': ['app', 'getVersion'],
  'app:open-logs-folder': ['app', 'openLogsFolder'],
  'app:get-locale-country': ['app', 'getLocaleCountry'],

  // ── debug ───────────────────────────────────────────────────────────────
  'debug:start': ['debug', 'start'],
  'debug:stop': ['debug', 'stop'],
  'debug:metrics': ['debug', 'onMetrics'],

  // ── store ───────────────────────────────────────────────────────────────
  'store:get': ['store', 'get'],
  'store:set': ['store', 'set'],
  'store:delete': ['store', 'delete'],

  // ── dialog ──────────────────────────────────────────────────────────────
  'dialog:open-directory': ['dialog', 'openDirectory'],
  'dialog:open-file': ['dialog', 'openFile'],

  // ── shell ───────────────────────────────────────────────────────────────
  'shell:show-in-folder': ['shell', 'showInFolder'],
  'shell:trash-file': ['shell', 'trashFile'],

  // ── media ───────────────────────────────────────────────────────────────
  'media:playback-state': ['media', 'sendPlaybackState'],
  'media:clear-state': ['media', 'clearState'],
  'media:command': ['media', 'onCommand'],

  // ── discord ─────────────────────────────────────────────────────────────
  'discord-rpc:get-settings': ['discord', 'getSettings'],
  'discord-rpc:update-settings': ['discord', 'updateSettings'],
  'discord-rpc:update-presence': ['discord', 'updatePresence'],
  'discord-rpc:clear-presence': ['discord', 'clearPresence'],

  // ── scrobble ────────────────────────────────────────────────────────────
  'scrobble:get-status': ['scrobble', 'getStatus'],
  'scrobble:set-enabled': ['scrobble', 'setEnabled'],
  'scrobble:lastfm-begin-auth': ['scrobble', 'lastfmBeginAuth'],
  'scrobble:lastfm-complete-auth': ['scrobble', 'lastfmCompleteAuth'],
  'scrobble:lastfm-disconnect': ['scrobble', 'lastfmDisconnect'],
  'scrobble:listenbrainz-connect': ['scrobble', 'listenBrainzConnect'],
  'scrobble:listenbrainz-disconnect': ['scrobble', 'listenBrainzDisconnect'],

  // ── library ─────────────────────────────────────────────────────────────
  'library:parse-metadata': ['library', 'parseMetadata'],
  'library:scan-folder': ['library', 'scanFolder'],
  'library:scan-folder-grouped': ['library', 'scanFolderGrouped'],
  'library:validate-files': ['library', 'validateFiles'],
  'library:scan-progress': ['library', 'onScanProgress'],
  'library:scan-cancel': ['library', 'cancelScan'],

  // ── lyrics / weather ────────────────────────────────────────────────────
  'lyrics:fetch': ['lyrics', 'fetch'],
  'weather:geocode': ['weather', 'geocode'],
  'weather:get-current': ['weather', 'getCurrent'],

  // ── db:tracks ───────────────────────────────────────────────────────────
  'db:tracks:get-all': ['db', 'tracks', 'getAll'],
  'db:tracks:add': ['db', 'tracks', 'add'],
  'db:tracks:add-many': ['db', 'tracks', 'addMany'],
  'db:tracks:remove': ['db', 'tracks', 'remove'],
  'db:tracks:remove-many': ['db', 'tracks', 'removeMany'],
  'db:tracks:update': ['db', 'tracks', 'update'],
  'db:tracks:update-many': ['db', 'tracks', 'updateMany'],
  'db:tracks:toggle-favorite': ['db', 'tracks', 'toggleFavorite'],
  'db:tracks:get-favorites': ['db', 'tracks', 'getFavorites'],
  'db:tracks:increment-play-count': ['db', 'tracks', 'incrementPlayCount'],
  'db:tracks:exists': ['db', 'tracks', 'exists'],
  'db:tracks:exists-many': ['db', 'tracks', 'existsMany'],
  'db:tracks:get-id-by-path': ['db', 'tracks', 'getIdByPath'],
  'db:tracks:search': ['db', 'tracks', 'search'],

  // ── db:history ──────────────────────────────────────────────────────────
  'db:history:record-play': ['db', 'history', 'recordPlay'],
  'db:history:get-recent': ['db', 'history', 'getRecent'],
  'db:history:get-summary': ['db', 'history', 'getSummary'],
  'db:history:get-activity': ['db', 'history', 'getActivity'],
  'db:history:get-hourly-activity': ['db', 'history', 'getHourlyActivity'],
  'db:history:get-weekly-insights': ['db', 'history', 'getWeeklyInsights'],

  // ── db:folders ──────────────────────────────────────────────────────────
  'db:folders:get-all': ['db', 'folders', 'getAll'],
  'db:folders:add': ['db', 'folders', 'add'],
  'db:folders:remove': ['db', 'folders', 'remove'],
  'db:folders:update-scanned': ['db', 'folders', 'updateScanned'],

  // ── db:playlists ────────────────────────────────────────────────────────
  'db:playlists:get-all': ['db', 'playlists', 'getAll'],
  'db:playlists:get': ['db', 'playlists', 'get'],
  'db:playlists:create': ['db', 'playlists', 'create'],
  'db:playlists:create-with-tracks': ['db', 'playlists', 'createWithTracks'],
  'db:playlists:update': ['db', 'playlists', 'update'],
  'db:playlists:delete': ['db', 'playlists', 'delete'],
  'db:playlists:get-tracks': ['db', 'playlists', 'getTracks'],
  'db:playlists:add-track': ['db', 'playlists', 'addTrack'],
  'db:playlists:add-tracks': ['db', 'playlists', 'addTracks'],
  'db:playlists:remove-track': ['db', 'playlists', 'removeTrack'],
  'db:playlists:remove-tracks': ['db', 'playlists', 'removeTracks'],
  'db:playlists:get-playlists-for-tracks': ['db', 'playlists', 'getPlaylistsForTracks'],
  'db:playlists:reorder': ['db', 'playlists', 'reorder'],

  // ── db:smart-playlists ──────────────────────────────────────────────────
  'db:smart-playlists:get-all': ['db', 'smartPlaylists', 'getAll'],
  'db:smart-playlists:get': ['db', 'smartPlaylists', 'get'],
  'db:smart-playlists:create': ['db', 'smartPlaylists', 'create'],
  'db:smart-playlists:update': ['db', 'smartPlaylists', 'update'],
  'db:smart-playlists:delete': ['db', 'smartPlaylists', 'delete'],
  'db:smart-playlists:get-tracks': ['db', 'smartPlaylists', 'getTracks'],
  'db:smart-playlists:preview': ['db', 'smartPlaylists', 'preview'],

  // ── db:backup ───────────────────────────────────────────────────────────
  'db:backup:export': ['db', 'backup', 'export'],
  'db:backup:import': ['db', 'backup', 'import'],

  // ── downloader ──────────────────────────────────────────────────────────
  'downloader:check': ['downloader', 'check'],
  'downloader:get-download-location': ['downloader', 'getDownloadLocation'],
  'downloader:set-download-location': ['downloader', 'setDownloadLocation'],
  'downloader:check-dependencies': ['downloader', 'checkDependencies'],
  'downloader:get-cached-tool-status': ['downloader', 'getCachedToolStatus'],
  'downloader:refresh-tool-status': ['downloader', 'refreshToolStatus'],
  'downloader:search': ['downloader', 'search'],
  'downloader:suggest': ['downloader', 'suggest'],
  'downloader:download': ['downloader', 'download'],
  'downloader:get-stream-url': ['downloader', 'getStreamUrl'],
  'downloader:install-ytdlp': ['downloader', 'installYtDlp'],
  'downloader:get-ytdlp-path': ['downloader', 'getYtDlpPath'],
  'downloader:check-ffmpeg': ['downloader', 'checkFfmpeg'],
  'downloader:install-ffmpeg': ['downloader', 'installFfmpeg'],
  'downloader:install-dependencies': ['downloader', 'installDependencies'],
  'downloader:queue-enqueue': ['downloader', 'enqueueDownload'],
  'downloader:queue-cancel': ['downloader', 'cancelDownload'],
  'downloader:queue-cancel-all': ['downloader', 'cancelAllDownloads'],
  'downloader:queue-clear-completed': ['downloader', 'clearCompletedDownloads'],
  'downloader:queue-pause': ['downloader', 'pauseDownloadQueue'],
  'downloader:queue-resume': ['downloader', 'resumeDownloadQueue'],
  'downloader:queue-mark-imported': ['downloader', 'markDownloadsImported'],
  'downloader:queue-get': ['downloader', 'getDownloadQueue'],
  'downloader:queue-state': ['downloader', 'onQueueState'],
  'downloader:progress': ['downloader', 'onProgress'],
  'downloader:install-progress': ['downloader', 'onInstallProgress'],
  'downloader:ffmpeg-install-progress': ['downloader', 'onFfmpegInstallProgress'],
  'downloader:dependency-install-progress': ['downloader', 'onDependencyInstallProgress'],

  // ── radio ───────────────────────────────────────────────────────────────
  'radio:favorites:get-all': ['radio', 'favorites', 'getAll'],
  'radio:favorites:add': ['radio', 'favorites', 'add'],
  'radio:favorites:remove': ['radio', 'favorites', 'remove'],
  'radio:favorites:is-favorite': ['radio', 'favorites', 'isFavorite'],

  // ── playlist ────────────────────────────────────────────────────────────
  'playlist:extract': ['playlist', 'extract'],
  'playlist:cancel': ['playlist', 'cancel'],
  'playlist:extract-progress': ['playlist', 'onExtractProgress'],

  // ── metadata ────────────────────────────────────────────────────────────
  'metadata:lookup': ['metadata', 'lookup'],
  'metadata:enrich:tracks': ['metadata', 'enrichTracks'],
  'metadata:enrich:preview': ['metadata', 'previewEnrich'],
  'metadata:enrich:cancel': ['metadata', 'cancelEnrichment'],
  'metadata:enrich:progress': ['metadata', 'onEnrichProgress'],
  'metadata:write-tags': ['metadata', 'writeTags'],

  // ── doctor ──────────────────────────────────────────────────────────────
  'doctor:scan': ['doctor', 'scan'],
  'doctor:cancel': ['doctor', 'cancel'],
  'doctor:progress': ['doctor', 'onProgress'],

  // ── loudness / waveform ─────────────────────────────────────────────────
  'loudness:analyze': ['loudness', 'analyze'],
  'loudness:cancel': ['loudness', 'cancel'],
  'loudness:progress': ['loudness', 'onProgress'],
  'waveform:get-peaks': ['waveform', 'getPeaks'],

  // ── recommendations ─────────────────────────────────────────────────────
  'recommendations:get': ['recommendations', 'get'],
  'recommendations:refresh': ['recommendations', 'refresh'],
  'recommendations:similar': ['recommendations', 'similar'],
  'recommendations:not-interested': ['recommendations', 'notInterested'],
  'recommendations:undo-not-interested': ['recommendations', 'undoNotInterested'],
  'recommendations:smart-mixes': ['recommendations', 'smartMixes'],

  // ── share ───────────────────────────────────────────────────────────────
  'share:track': ['share', 'track'],
  'share:playlist': ['share', 'playlist'],
  'share:import': ['share', 'import'],
  'share:cache-youtube-id': ['share', 'cacheYoutubeId'],
  'share:deep-link': ['share', 'onDeepLink'],

  // ── updater ─────────────────────────────────────────────────────────────
  'updater:check-for-updates': ['updater', 'checkForUpdates'],
  'updater:start-download': ['updater', 'startDownload'],
  'updater:install-now': ['updater', 'installNow'],
  'updater:checking-for-update': ['updater', 'onCheckingForUpdate'],
  'updater:update-available': ['updater', 'onUpdateAvailable'],
  'updater:update-not-available': ['updater', 'onUpdateNotAvailable'],
  'updater:download-progress': ['updater', 'onDownloadProgress'],
  'updater:update-downloaded': ['updater', 'onUpdateDownloaded'],
  'updater:error': ['updater', 'onUpdateError'],

  // ── system / storage ────────────────────────────────────────────────────
  'system:notice': ['system', 'onNotice'],
  'storage:get-usage': ['storage', 'getUsage'],
};
