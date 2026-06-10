import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type RadioStationInput, type RadioFavorite } from '@shiranami/contracts';

const C = IPC_CHANNELS.radio.favorites;

export interface RadioFavoritesApi {
  getAll: () => Promise<RadioFavorite[]>;
  add: (station: RadioStationInput) => Promise<RadioFavorite>;
  remove: (stationUuid: string) => Promise<void>;
  isFavorite: (stationUuid: string) => Promise<boolean>;
}

export interface RadioApi {
  favorites: RadioFavoritesApi;
}

export const radioApi: RadioApi = {
  favorites: {
    getAll: () => invoke(C.getAll),
    add: station => invoke(C.add, station),
    remove: stationUuid => invoke(C.remove, stationUuid),
    isFavorite: stationUuid => invoke(C.isFavorite, stationUuid),
  },
};
