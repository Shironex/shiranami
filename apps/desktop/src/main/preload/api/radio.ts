import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type RadioApi, type RadioFavoritesApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.radio.favorites;

export type { RadioApi, RadioFavoritesApi };

export const radioApi: RadioApi = {
  favorites: {
    getAll: () => invoke(C.getAll),
    add: station => invoke(C.add, station),
    remove: stationUuid => invoke(C.remove, stationUuid),
    isFavorite: stationUuid => invoke(C.isFavorite, stationUuid),
  },
};
