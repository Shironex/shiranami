import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type WeatherApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.weather;

export type { WeatherApi };

export const weatherApi: WeatherApi = {
  geocode: query => invoke(C.geocode, query),
  getCurrent: coords => invoke(C.getCurrent, coords),
};
