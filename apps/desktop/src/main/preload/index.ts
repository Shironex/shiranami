// Electron preload entry point. Composes the per-namespace API modules into
// the renderer-facing `window.electronAPI` shape and exposes it via Electron's
// contextBridge. Channel allowlisting is centralized in ./context-bridge.ts and
// derives from the `@shiranami/contracts` IPC manifest, so the security
// surface tracks the manifest mechanically.

import { contextBridge } from 'electron';
import {
  isIpcError,
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '../ipc/errors';
import { appApi, type AppApi } from './api/app';
import { dbApi, type DbApi } from './api/db';
import { debugApi, type DebugApi } from './api/debug';
import { dialogApi, type DialogApi } from './api/dialog';
import { discordApi, type DiscordApi } from './api/discord';
import { downloaderApi, type DownloaderApi } from './api/downloader';
import { libraryApi, type LibraryApi } from './api/library';
import { loudnessApi, type LoudnessApi } from './api/loudness';
import { waveformApi, type WaveformApi } from './api/waveform';
import { lyricsApi, type LyricsApi } from './api/lyrics';
import { weatherApi, type WeatherApi } from './api/weather';
import { mediaApi, type MediaApi } from './api/media';
import { metadataApi, type MetadataApi } from './api/metadata';
import { playlistApi, type PlaylistApi } from './api/playlist';
import { radioApi, type RadioApi } from './api/radio';
import { recommendationsApi, type RecommendationsApi } from './api/recommendations';
import { scrobbleApi, type ScrobbleApi } from './api/scrobble';
import { shareApi, type ShareApi } from './api/share';
import { shellApi, type ShellApi } from './api/shell';
import { storageApi, type StorageApi } from './api/storage';
import { storeApi, type StoreApi } from './api/store';
import { updaterApi, type UpdaterApi } from './api/updater';
import { windowApi, type WindowApi } from './api/window';
import { systemApi, type SystemApi } from './api/system';

export interface ElectronAPI {
  window: WindowApi;
  store: StoreApi;
  dialog: DialogApi;
  app: AppApi;
  library: LibraryApi;
  loudness: LoudnessApi;
  waveform: WaveformApi;
  db: DbApi;
  lyrics: LyricsApi;
  weather: WeatherApi;
  media: MediaApi;
  discord: DiscordApi;
  downloader: DownloaderApi;
  updater: UpdaterApi;
  shell: ShellApi;
  radio: RadioApi;
  playlist: PlaylistApi;
  metadata: MetadataApi;
  recommendations: RecommendationsApi;
  scrobble: ScrobbleApi;
  share: ShareApi;
  debug: DebugApi;
  system: SystemApi;
  storage: StorageApi;
  errors: {
    isIpcError: (e: unknown) => e is { code: string; message: string; details?: unknown };
    SHARE_ERROR_CODES: typeof SHARE_ERROR_CODES;
    PLAYLIST_ERROR_CODES: typeof PLAYLIST_ERROR_CODES;
    VALIDATION_ERROR_CODES: typeof VALIDATION_ERROR_CODES;
  };
  platform: NodeJS.Platform;
  /**
   * True only when the main process was launched with SHIRANAMI_E2E=1.
   * The renderer reads this and conditionally registers store handles on
   * `window.__shiranami` so e2e specs can drive playback / library state
   * via `page.evaluate`. Always-on rather than a dynamic call so the check
   * is synchronous at bootstrap.
   */
  __e2e: boolean;
}

const electronAPI: ElectronAPI = {
  window: windowApi,
  store: storeApi,
  dialog: dialogApi,
  app: appApi,
  library: libraryApi,
  loudness: loudnessApi,
  waveform: waveformApi,
  db: dbApi,
  lyrics: lyricsApi,
  weather: weatherApi,
  media: mediaApi,
  discord: discordApi,
  downloader: downloaderApi,
  updater: updaterApi,
  shell: shellApi,
  radio: radioApi,
  playlist: playlistApi,
  metadata: metadataApi,
  recommendations: recommendationsApi,
  scrobble: scrobbleApi,
  share: shareApi,
  debug: debugApi,
  system: systemApi,
  storage: storageApi,
  errors: {
    isIpcError,
    SHARE_ERROR_CODES,
    PLAYLIST_ERROR_CODES,
    VALIDATION_ERROR_CODES,
  },
  platform: process.platform,
  __e2e: process.env.SHIRANAMI_E2E === '1',
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
