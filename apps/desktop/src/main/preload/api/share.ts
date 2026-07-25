import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type ShareApi } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.share;

export type { ShareApi };

export const shareApi: ShareApi = {
  track: trackId => invoke(C.track, trackId),
  playlist: playlistId => invoke(C.playlist, playlistId),
  import: code => invoke(C.import, code),
  cacheYoutubeId: (trackId, youtubeId) => invoke(C.cacheYoutubeId, trackId, youtubeId),
  onDeepLink: createIpcListener<string>(C.deepLink),
};
