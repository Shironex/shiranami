/**
 * The fixture `window.electronAPI`. Reads answer from the demo library; writes
 * succeed and change nothing that outlives the page, except where the UI reads
 * its own write straight back (favorites, the settings store, playlists).
 *
 * Typed against the real surface so a renamed method or a changed return shape
 * fails to compile here. Members left out resolve to `undefined` through the
 * lazy proxy in `../lazyApi`, which logs each one once.
 */

import type { ElectronAPI } from '@/types/electron';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';
import type { Playlist, Track, WatchedFolder } from '@shiranami/contracts';
import { SHOWCASE_NOW } from '../determinism';
import { TRACKS, trackById } from './catalog';
import {
  HISTORY,
  NOW_PLAYING_ID,
  NOW_PLAYING_LYRICS,
  PLAYLISTS,
  PLAYLIST_TRACKS,
  RADIO_FAVORITES,
  SMART_PLAYLISTS,
  downloadQueue,
  evaluateSmartPlaylist,
  extractedPlaylist,
  hourlyActivity,
  listeningActivity,
  listeningSummary,
  recommendationShelves,
  searchResults,
  searchSuggestions,
  smartMixes,
  weeklyInsights,
} from './library';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : DeepPartial<T[K]>;
};

export type ShowcaseApi = DeepPartial<ElectronAPI>;

const nowIso = () => new Date(SHOWCASE_NOW).toISOString();
const noop = async () => {};
const unsubscribe = () => () => {};

const MUSIC_ROOT = '/Users/mika/Music';

const FOLDERS: WatchedFolder[] = [
  {
    id: 'folder-music',
    path: MUSIC_ROOT,
    lastScanned: new Date(SHOWCASE_NOW - 3 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(SHOWCASE_NOW - 200 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/** The electron-store stand-in: what the app writes, it reads back. */
function createStore(): Map<string, unknown> {
  const nowPlaying = trackById(NOW_PLAYING_ID);
  const album = TRACKS.filter(track => track.album === nowPlaying.album);
  return new Map<string, unknown>([
    ['app.onboardingCompleted', true],
    ['app.supportBannerSeen', true],
    ['settings', { rememberPlaybackPosition: true }],
    [
      'player-state',
      {
        currentTrackPath: nowPlaying.filePath,
        queuePaths: album.map(track => track.filePath),
        queueIndex: album.findIndex(track => track.id === nowPlaying.id),
        currentTime: 68,
        isPlaying: false,
      },
    ],
    ['player.volume', 0.7],
    ['player.isMuted', false],
  ]);
}

/** Seeded waveform peaks with a musical shape: quiet intro, louder body, fade. */
function peaksFor(filePath: string): number[] {
  let seed = 0;
  for (const char of filePath) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const peaks: number[] = [];
  for (let i = 0; i < 512; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const position = i / 511;
    const envelope = Math.min(1, position * 8) * Math.min(1, (1 - position) * 6);
    const beat = 0.75 + 0.25 * Math.sin(i / 3);
    peaks.push(Math.max(0.04, envelope * beat * (0.55 + (seed / 4294967296) * 0.45)));
  }
  return peaks;
}

export function createShowcaseApi(): ShowcaseApi {
  const store = createStore();
  const favorites = new Set(TRACKS.filter(track => track.isFavorite).map(track => track.id));
  const playlists: Playlist[] = [...PLAYLISTS];
  const playlistTracks = new Map(PLAYLIST_TRACKS);

  const withFavorite = (track: Track): Track => ({ ...track, isFavorite: favorites.has(track.id) });
  const allTracks = () => TRACKS.map(withFavorite);

  return {
    app: {
      getVersion: async () => '2.0.0',
      getLocaleCountry: async () => 'PL',
      openLogsFolder: noop,
    },
    window: {
      isMaximized: async () => false,
      onMaximizedChange: unsubscribe,
      minimize: noop,
      maximize: noop,
      close: noop,
      setAlwaysOnTop: noop,
      setCompactMode: noop,
    },
    store: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      set: async <T>(key: string, value: T) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    },
    dialog: {
      openDirectory: async () => null,
      openFile: async () => null,
    },
    shell: { showInFolder: noop, trashFile: noop },
    media: { onCommand: unsubscribe, sendPlaybackState: noop, clearState: noop },
    system: { onNotice: unsubscribe },
    debug: { start: noop, stop: noop, onMetrics: unsubscribe },
    updater: {
      checkForUpdates: async () => ({ enabled: true }),
      startDownload: noop,
      installNow: noop,
      onCheckingForUpdate: unsubscribe,
      onUpdateAvailable: unsubscribe,
      onUpdateNotAvailable: unsubscribe,
      onDownloadProgress: unsubscribe,
      onUpdateDownloaded: unsubscribe,
      onUpdateError: unsubscribe,
    },
    library: {
      onScanProgress: unsubscribe,
      cancelScan: noop,
      validateFiles: async () => [],
    },
    analysis: { onProgress: unsubscribe, cancel: noop },
    doctor: { onProgress: unsubscribe, cancel: noop },
    loudness: { onProgress: unsubscribe, cancel: noop },
    waveform: { getPeaks: async filePath => ({ peaks: peaksFor(filePath) }) },
    companion: {
      getState: async () => ({
        name: 'Shio',
        species: 'shio',
        stage: 2,
        xp: 1840,
        accessories: [],
        hatchedAt: new Date(SHOWCASE_NOW - 120 * 24 * 60 * 60 * 1000).toISOString(),
        lastSeenAt: new Date(SHOWCASE_NOW - 2 * 60 * 60 * 1000).toISOString(),
      }),
      onXp: unsubscribe,
    },
    weather: {
      getCurrent: async () => ({ tempC: 18, condition: 'rain', label: 'Light rain' }),
      geocode: async () => ({ lat: 35.01, lon: 135.77, label: 'Kyoto' }),
    },
    lyrics: {
      fetch: async (title: string) =>
        title === trackById(NOW_PLAYING_ID).title
          ? {
              synced: NOW_PLAYING_LYRICS.map(([time, text]) => ({ time, text })),
              plain: NOW_PLAYING_LYRICS.map(([, text]) => text).join('\n'),
              source: 'local-lrc',
            }
          : { synced: null, plain: null, source: null },
      onSaveProgress: unsubscribe,
    },
    db: {
      tracks: {
        getAll: async () => allTracks(),
        getFavorites: async () => allTracks().filter(track => track.isFavorite),
        toggleFavorite: async id => {
          if (favorites.has(id)) favorites.delete(id);
          else favorites.add(id);
          return withFavorite(trackById(id));
        },
        search: async (query: string, limit = 50) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return [];
          return allTracks()
            .filter(track =>
              [track.title, track.artist, track.album].some(field =>
                (field ?? '').toLowerCase().includes(needle)
              )
            )
            .slice(0, limit);
        },
        exists: async () => true,
        existsMany: async paths => paths,
        getIdByPath: async path => TRACKS.find(track => track.filePath === path)?.id ?? null,
        incrementPlayCount: async id => withFavorite(trackById(id)),
      },
      history: {
        getRecent: async (options = {}) => {
          const since = options.since ? Date.parse(options.since) : -Infinity;
          return HISTORY.filter(entry => Date.parse(entry.playedAt) >= since).slice(
            0,
            options.limit ?? HISTORY.length
          );
        },
        getSummary: async (options = {}) => listeningSummary(options.since),
        getActivity: async (options = {}) => listeningActivity(options.since, options.until),
        getHourlyActivity: async () => hourlyActivity(),
        getWeeklyInsights: async () => weeklyInsights(),
      },
      folders: {
        getAll: async () => FOLDERS,
      },
      playlists: {
        getAll: async () => playlists,
        get: async id => playlists.find(playlist => playlist.id === id),
        getTracks: async id => (playlistTracks.get(id) ?? []).map(trackById).map(withFavorite),
        getPlaylistsForTracks: async trackIds =>
          playlists
            .filter(playlist =>
              (playlistTracks.get(playlist.id) ?? []).some(id => trackIds.includes(id))
            )
            .map(playlist => playlist.id),
        addTrack: async () => ({ id: 'membership' }),
      },
      smartPlaylists: {
        getAll: async () => SMART_PLAYLISTS,
        get: async id => SMART_PLAYLISTS.find(playlist => playlist.id === id) ?? null,
        getTracks: async id => {
          const playlist = SMART_PLAYLISTS.find(candidate => candidate.id === id);
          return playlist ? evaluateSmartPlaylist(playlist).map(withFavorite) : [];
        },
        preview: async definition => evaluateSmartPlaylist(definition).map(withFavorite),
      },
    },
    recommendations: {
      get: async () => recommendationShelves(),
      refresh: async () => recommendationShelves(),
      similar: async seed =>
        TRACKS.filter(track => track.id !== seed)
          .slice(0, 8)
          .map((track, index) => ({ trackId: track.id, similarity: 0.92 - index * 0.05 })),
      smartMixes: async () => smartMixes(),
    },
    downloader: {
      getDownloadQueue: async () => downloadQueue(),
      onQueueState: unsubscribe,
      onProgress: unsubscribe,
      onInstallProgress: unsubscribe,
      onFfmpegInstallProgress: unsubscribe,
      onDependencyInstallProgress: unsubscribe,
      checkDependencies: async () => ({ ytdlpInstalled: true, ffmpegInstalled: true }),
      check: async () => ({ installed: true, version: '2026.08.19' }),
      checkFfmpeg: async () => ({ installed: true, version: '7.1' }),
      getCachedToolStatus: async () => ({
        ytdlp: { installed: true, version: '2026.08.19', updateAvailable: false },
        ffmpeg: { installed: true, version: '7.1' },
        ytdlpPath: '/Users/mika/Library/Application Support/Shiranami/bin/yt-dlp',
        downloadLocation: {
          path: `${MUSIC_ROOT}/Downloads`,
          defaultPath: `${MUSIC_ROOT}/Downloads`,
          isDefault: true,
        },
        timestamp: SHOWCASE_NOW,
      }),
      getDownloadLocation: async () => ({
        path: `${MUSIC_ROOT}/Downloads`,
        defaultPath: `${MUSIC_ROOT}/Downloads`,
        isDefault: true,
      }),
      search: async query => searchResults(query),
      suggest: async query => searchSuggestions(query),
    },
    playlist: {
      extract: async () => extractedPlaylist(),
      onExtractProgress: unsubscribe,
      cancel: noop,
    },
    radio: {
      favorites: {
        getAll: async () => RADIO_FAVORITES,
        isFavorite: async uuid => RADIO_FAVORITES.some(favorite => favorite.stationUuid === uuid),
      },
      onNowPlaying: unsubscribe,
      log: { get: async () => [] },
    },
    metadata: { onEnrichProgress: unsubscribe },
    scrobble: {
      getStatus: async () => ({
        enabled: true,
        lastfmConnected: true,
        lastfmUsername: 'mika_listens',
        listenBrainzConnected: false,
        pendingCount: 0,
      }),
    },
    share: { onDeepLink: unsubscribe },
    discord: {
      getSettings: async () => ({
        enabled: true,
        showTrackDetails: true,
        showElapsedTime: true,
        useCustomTemplates: false,
        templates: DEFAULT_DISCORD_TEMPLATES,
      }),
      updatePresence: noop,
      clearPresence: noop,
    },
    storage: {
      getUsage: async folderPaths => ({
        volumes: [
          {
            volumeKey: 'disk1',
            mountLabel: 'Macintosh HD',
            folderPaths,
            musicBytes: 38_400_000_000,
            totalBytes: 994_700_000_000,
            freeBytes: 412_300_000_000,
            usedBytes: 582_400_000_000,
          },
        ],
        computedAt: nowIso(),
      }),
    },
  };
}
