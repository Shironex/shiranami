import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type RadioApi,
  type RadioFavoritesApi,
  type RadioNowPlaying,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.radio;

export type { RadioApi, RadioFavoritesApi };

export const radioApi: RadioApi = {
  favorites: {
    getAll: () => invoke(C.favorites.getAll),
    add: station => invoke(C.favorites.add, station),
    remove: stationUuid => invoke(C.favorites.remove, stationUuid),
    isFavorite: stationUuid => invoke(C.favorites.isFavorite, stationUuid),
  },
  onNowPlaying: createIpcListener<RadioNowPlaying>(C.nowPlaying),
};
