import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.playlist;

interface PlaylistTrack {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
  /** 0..1 Spotify-match score; only present on the Spotify playlist path. */
  matchConfidence?: number;
  /** 'low' when the best YouTube candidate scored below the threshold. */
  matchFlag?: 'low' | 'ok';
}

export interface PlaylistExtractResult {
  /** Source playlist title, when the provider exposed one. */
  title: string | null;
  tracks: PlaylistTrack[];
}

export interface PlaylistApi {
  extract: (url: string) => Promise<PlaylistExtractResult>;
  cancel: () => Promise<void>;
  onExtractProgress: (
    callback: (data: { current: number; total: number; trackName: string }) => void
  ) => () => void;
}

export const playlistApi: PlaylistApi = {
  extract: url => ipcRenderer.invoke(C.extract, url),
  cancel: () => ipcRenderer.invoke(C.cancel),
  onExtractProgress: createIpcListener<{ current: number; total: number; trackName: string }>(
    C.extractProgress
  ),
};
