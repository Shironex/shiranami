import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.media;

export interface MediaApi {
  onCommand: (callback: (command: string) => void) => () => void;
  sendPlaybackState: (state: {
    isPlaying: boolean;
    title: string;
    artist: string;
    album: string;
    duration: number;
    currentTime: number;
    albumArt: string | null;
  }) => Promise<void>;
  clearState: () => Promise<void>;
}

export const mediaApi: MediaApi = {
  onCommand: createIpcListener<string>(C.command),
  sendPlaybackState: state => ipcRenderer.invoke(C.playbackState, state),
  clearState: () => ipcRenderer.invoke(C.clearState),
};
