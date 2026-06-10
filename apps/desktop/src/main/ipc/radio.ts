import { ipcMain } from 'electron';
import { radioFavorites, eq, desc, type NewRadioFavorite } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS, type RadioFavorite } from '@shiranami/contracts';
import { logger } from '../logger';
import { handle } from './with-ipc-handler';
import {
  radioFavoritesGetAllArgs,
  radioFavoritesAddArgs,
  radioFavoritesRemoveArgs,
  radioFavoritesIsFavoriteArgs,
} from './schemas/radio';

const C = IPC_CHANNELS.radio.favorites;

export function registerRadioHandlers(): void {
  handle(
    C.getAll,
    async (): Promise<RadioFavorite[]> => {
      const db = getDatabase();
      return db.select().from(radioFavorites).orderBy(desc(radioFavorites.createdAt)).all();
    },
    { schema: radioFavoritesGetAllArgs }
  );

  handle(
    C.add,
    async (_event, station: Omit<NewRadioFavorite, 'id'>): Promise<RadioFavorite> => {
      logger.info(`[radio] Added favorite: "${station.name}" (${station.stationUuid})`);
      const db = getDatabase();
      const id = crypto.randomUUID();
      return db
        .insert(radioFavorites)
        .values({ ...station, id })
        .returning()
        .get();
    },
    { schema: radioFavoritesAddArgs }
  );

  handle(
    C.remove,
    async (_event, stationUuid: string) => {
      logger.info(`[radio] Removed favorite: ${stationUuid}`);
      const db = getDatabase();
      db.delete(radioFavorites).where(eq(radioFavorites.stationUuid, stationUuid)).run();
    },
    { schema: radioFavoritesRemoveArgs }
  );

  handle(
    C.isFavorite,
    async (_event, stationUuid: string) => {
      const db = getDatabase();
      const row = db
        .select({ id: radioFavorites.id })
        .from(radioFavorites)
        .where(eq(radioFavorites.stationUuid, stationUuid))
        .get();
      return !!row;
    },
    { schema: radioFavoritesIsFavoriteArgs }
  );
}

export function cleanupRadioHandlers(): void {
  ipcMain.removeHandler(C.getAll);
  ipcMain.removeHandler(C.add);
  ipcMain.removeHandler(C.remove);
  ipcMain.removeHandler(C.isFavorite);
}
