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
}

export interface PlaylistApi {
  extract: (url: string) => Promise<PlaylistTrack[]>;
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
