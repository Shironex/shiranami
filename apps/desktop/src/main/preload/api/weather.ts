import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, type GeocodeResult, type WeatherCurrent } from '@shiranami/contracts';

const C = IPC_CHANNELS.weather;

export interface WeatherApi {
  geocode: (query: string) => Promise<GeocodeResult | null>;
  getCurrent: (coords: { lat: number; lon: number }) => Promise<WeatherCurrent>;
}

export const weatherApi: WeatherApi = {
  geocode: query => ipcRenderer.invoke(C.geocode, query),
  getCurrent: coords => ipcRenderer.invoke(C.getCurrent, coords),
};
