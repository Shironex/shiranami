import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.share;

interface ShareCode {
  code: string;
  url: string;
  expiresAt: string;
}

interface ImportResult {
  type: 'TRACK' | 'PLAYLIST';
  payload: unknown;
  code: string;
  expiresAt: string;
}

export interface ShareApi {
  track: (trackId: string) => Promise<ShareCode>;
  playlist: (playlistId: string) => Promise<ShareCode>;
  import: (code: string) => Promise<ImportResult>;
  cacheYoutubeId: (trackId: string, youtubeId: string) => Promise<void>;
  onDeepLink: (callback: (code: string) => void) => () => void;
}

export const shareApi: ShareApi = {
  track: trackId => ipcRenderer.invoke(C.track, trackId),
  playlist: playlistId => ipcRenderer.invoke(C.playlist, playlistId),
  import: code => ipcRenderer.invoke(C.import, code),
  cacheYoutubeId: (trackId, youtubeId) => ipcRenderer.invoke(C.cacheYoutubeId, trackId, youtubeId),
  onDeepLink: createIpcListener<string>(C.deepLink),
};
