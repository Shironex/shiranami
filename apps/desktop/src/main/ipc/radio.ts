import { ipcMain } from 'electron';
import {
  radioFavorites,
  eq,
  desc,
  type NewRadioFavorite,
} from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { logger } from '../logger';
import { handle } from './with-ipc-handler';
import {
  radioFavoritesGetAllArgs,
  radioFavoritesAddArgs,
  radioFavoritesRemoveArgs,
  radioFavoritesIsFavoriteArgs,
} from './schemas/radio';

export function registerRadioHandlers(): void {
  handle(
    'radio:favorites:get-all',
    async () => {
      const db = getDatabase();
      return db.select().from(radioFavorites).orderBy(desc(radioFavorites.createdAt)).all();
    },
    { schema: radioFavoritesGetAllArgs },
  );

  handle(
    'radio:favorites:add',
    async (_event, station: Omit<NewRadioFavorite, 'id'>) => {
      logger.info(`[radio] Added favorite: "${station.name}" (${station.stationUuid})`);
      const db = getDatabase();
      const id = crypto.randomUUID();
      return db.insert(radioFavorites).values({ ...station, id }).returning().get();
    },
    { schema: radioFavoritesAddArgs },
  );

  handle(
    'radio:favorites:remove',
    async (_event, stationUuid: string) => {
      logger.info(`[radio] Removed favorite: ${stationUuid}`);
      const db = getDatabase();
      db.delete(radioFavorites).where(eq(radioFavorites.stationUuid, stationUuid)).run();
    },
    { schema: radioFavoritesRemoveArgs },
  );

  handle(
    'radio:favorites:is-favorite',
    async (_event, stationUuid: string) => {
      const db = getDatabase();
      const row = db
        .select({ id: radioFavorites.id })
        .from(radioFavorites)
        .where(eq(radioFavorites.stationUuid, stationUuid))
        .get();
      return !!row;
    },
    { schema: radioFavoritesIsFavoriteArgs },
  );
}

export function cleanupRadioHandlers(): void {
  ipcMain.removeHandler('radio:favorites:get-all');
  ipcMain.removeHandler('radio:favorites:add');
  ipcMain.removeHandler('radio:favorites:remove');
  ipcMain.removeHandler('radio:favorites:is-favorite');
}
