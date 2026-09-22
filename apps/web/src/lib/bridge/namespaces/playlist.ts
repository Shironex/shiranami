import {
  IPC_CHANNELS,
  type PlaylistApi,
  type PlaylistExtractProgress,
  type PlaylistExtractResult,
} from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { extractProgress } from '../narrowers';
import { asContract } from '../wire';

const C = IPC_CHANNELS.playlist;

export const playlistApi: PlaylistApi = {
  extract: url => asContract<PlaylistExtractResult>(commands.playlistExtract(url)),
  cancel: async () => {
    await commands.playlistCancel();
  },
  onExtractProgress: callback =>
    subscribeChannel<PlaylistExtractProgress>(
      C.extractProgress,
      events.playlistExtractProgress,
      extractProgress,
      callback
    ),
};
