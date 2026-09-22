import type { WeatherApi } from '@shiranami/contracts';
import { commands } from '../commands';

export const weatherApi: WeatherApi = {
  geocode: query => commands.weatherGeocode(query),
  getCurrent: coords => commands.weatherGetCurrent(coords),
};
