import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.radio.favorites;

interface RadioStation {
  stationUuid: string;
  name: string;
  url: string;
  urlResolved: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  countryCode?: string;
  language?: string;
  codec?: string;
  bitrate?: number;
  tags?: string;
}

export interface RadioFavoritesApi {
  getAll: () => Promise<unknown[]>;
  add: (station: RadioStation) => Promise<unknown>;
  remove: (stationUuid: string) => Promise<void>;
  isFavorite: (stationUuid: string) => Promise<boolean>;
}

export interface RadioApi {
  favorites: RadioFavoritesApi;
}

export const radioApi: RadioApi = {
  favorites: {
    getAll: () => ipcRenderer.invoke(C.getAll),
    add: station => ipcRenderer.invoke(C.add, station),
    remove: stationUuid => ipcRenderer.invoke(C.remove, stationUuid),
    isFavorite: stationUuid => ipcRenderer.invoke(C.isFavorite, stationUuid) as Promise<boolean>,
  },
};
