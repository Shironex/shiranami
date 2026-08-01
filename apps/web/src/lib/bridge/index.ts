/**
 * `window.electronAPI`, rebuilt over the generated Tauri bindings.
 *
 * Decision D8: the renderer keeps calling `window.electronAPI.*`. This composes
 * the same 24 namespaces `apps/desktop/src/main/preload/index.ts` composed, from
 * one module per namespace, in the same order — so the two files diff against
 * each other and a namespace that went missing is visible rather than inferred.
 *
 * The object is annotated `ElectronAPI`, which is the renderer's own ambient
 * declaration. That is the compile-time half of the contract test: a method the
 * renderer believes it can call and the shim does not implement fails to compile
 * here, at the object literal, exactly as the preload's `ElectronAPI extends
 * SharedElectronApi` annotation did the same job on the other side of the wire.
 */

import type { ElectronAPI } from '@/types/electron';
import {
  isIpcError,
  PLAYLIST_ERROR_CODES,
  SHARE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
import { detectPlatform, isE2eHarness } from './environment';
import { appApi } from './namespaces/app';
import { dbApi } from './namespaces/db';
import { debugApi } from './namespaces/debug';
import { dialogApi } from './namespaces/dialog';
import { discordApi } from './namespaces/discord';
import { downloaderApi } from './namespaces/downloader';
import { libraryApi } from './namespaces/library';
import { loudnessApi } from './namespaces/loudness';
import { lyricsApi } from './namespaces/lyrics';
import { mediaApi } from './namespaces/media';
import { metadataApi } from './namespaces/metadata';
import { playlistApi } from './namespaces/playlist';
import { radioApi } from './namespaces/radio';
import { recommendationsApi } from './namespaces/recommendations';
import { scrobbleApi } from './namespaces/scrobble';
import { shareApi } from './namespaces/share';
import { shellApi } from './namespaces/shell';
import { storageApi } from './namespaces/storage';
import { storeApi } from './namespaces/store';
import { systemApi } from './namespaces/system';
import { updaterApi } from './namespaces/updater';
import { waveformApi } from './namespaces/waveform';
import { weatherApi } from './namespaces/weather';
import { windowApi } from './namespaces/window';

/** Build the surface. Pure — {@link installElectronApiBridge} decides whether it is used. */
export function createElectronApi(): ElectronAPI {
  return {
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
    // Re-exposed unchanged. `isIpcError` is structural and the four registries
    // are frozen literals, so all four cross the bridge as themselves rather
    // than as anything the backend has to agree to.
    errors: {
      isIpcError,
      SHARE_ERROR_CODES,
      PLAYLIST_ERROR_CODES,
      VALIDATION_ERROR_CODES,
    },
    platform: detectPlatform(),
    __e2e: isE2eHarness(),
  };
}
