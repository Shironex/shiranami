import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type PlaylistApi,
  type PlaylistExtractProgress,
  type PlaylistExtractResult,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.playlist;

export type { PlaylistApi, PlaylistExtractResult };

export const playlistApi: PlaylistApi = {
  extract: url => invoke(C.extract, url),
  cancel: () => invoke(C.cancel),
  onExtractProgress: createIpcListener<PlaylistExtractProgress>(C.extractProgress),
};
