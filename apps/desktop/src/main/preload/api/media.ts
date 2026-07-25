import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type MediaApi } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.media;

export type { MediaApi };

export const mediaApi: MediaApi = {
  onCommand: createIpcListener<string>(C.command),
  sendPlaybackState: state => invoke(C.playbackState, state),
  clearState: () => invoke(C.clearState),
};
