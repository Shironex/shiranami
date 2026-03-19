import { ipcMain } from 'electron';
import {
  getDatabase,
  radioFavorites,
  eq,
  desc,
  type NewRadioFavorite,
} from '@shiranami/database';

export function registerRadioHandlers(): void {
  ipcMain.handle('radio:favorites:get-all', async () => {
    const db = getDatabase();
    return db.select().from(radioFavorites).orderBy(desc(radioFavorites.createdAt)).all();
  });

  ipcMain.handle('radio:favorites:add', async (_event, station: Omit<NewRadioFavorite, 'id'>) => {
    const db = getDatabase();
    const id = crypto.randomUUID();
    return db.insert(radioFavorites).values({ ...station, id }).returning().get();
  });

  ipcMain.handle('radio:favorites:remove', async (_event, stationUuid: string) => {
    const db = getDatabase();
    db.delete(radioFavorites).where(eq(radioFavorites.stationUuid, stationUuid)).run();
  });

  ipcMain.handle('radio:favorites:is-favorite', async (_event, stationUuid: string) => {
    const db = getDatabase();
    const row = db
      .select({ id: radioFavorites.id })
      .from(radioFavorites)
      .where(eq(radioFavorites.stationUuid, stationUuid))
      .get();
    return !!row;
  });
}

export function cleanupRadioHandlers(): void {
  ipcMain.removeHandler('radio:favorites:get-all');
  ipcMain.removeHandler('radio:favorites:add');
  ipcMain.removeHandler('radio:favorites:remove');
  ipcMain.removeHandler('radio:favorites:is-favorite');
}
