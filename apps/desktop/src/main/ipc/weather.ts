import { ipcMain } from 'electron';
import { IPC_CHANNELS, WEATHER_UNAVAILABLE, type GeocodeResult } from '@shiranami/contracts';
import { geocodeCity, getCurrentWeather } from '../weather-service';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import { weatherGeocodeArgs, weatherGetCurrentArgs } from './schemas/weather';

const C = IPC_CHANNELS.weather;

export function registerWeatherHandlers(): void {
  handle(
    C.geocode,
    async (_event, query: string): Promise<GeocodeResult | null> => {
      return geocodeCity(query);
    },
    { schema: weatherGeocodeArgs }
  );

  handle(
    C.getCurrent,
    async (_event, coords: { lat: number; lon: number }) => {
      try {
        return await getCurrentWeather(coords);
      } catch (err) {
        // Surface a discriminable code so the renderer can show a quiet
        // "Weather unavailable" mini-state instead of crashing the card.
        if (err instanceof Error && err.message === WEATHER_UNAVAILABLE) {
          throw new IpcError(WEATHER_UNAVAILABLE, 'Weather lookup failed');
        }
        throw err;
      }
    },
    { schema: weatherGetCurrentArgs }
  );
}

export function cleanupWeatherHandlers(): void {
  ipcMain.removeHandler(C.geocode);
  ipcMain.removeHandler(C.getCurrent);
}
