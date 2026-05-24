import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { tracks, eq, desc, inArray, sql, type NewTrack } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from '../../logger';
import { handle } from '../with-ipc-handler';
import { pruneOrphanedAlbumArt } from '../../art-protocol';
import {
  tracksGetAllArgs,
  tracksAddArgs,
  tracksAddManyArgs,
  tracksRemoveArgs,
  tracksRemoveManyArgs,
  tracksUpdateArgs,
  tracksUpdateManyArgs,
  tracksToggleFavoriteArgs,
  tracksGetFavoritesArgs,
  tracksIncrementPlayCountArgs,
  tracksExistsArgs,
  tracksExistsManyArgs,
} from '../schemas/db-tracks';

const T = IPC_CHANNELS.db.tracks;

export function registerTrackHandlers(): void {
  handle(
    T.getAll,
    async () => {
      const db = getDatabase();
      return db.select().from(tracks).orderBy(desc(tracks.createdAt)).all();
    },
    { schema: tracksGetAllArgs }
  );

  handle(
    T.add,
    async (_event, track: Omit<NewTrack, 'id'>) => {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const row: NewTrack = { ...track, id };
      // file_path is UNIQUE. A concurrent import of the same file (the renderer
      // does a non-atomic exists()->add() across two IPC calls) would otherwise
      // throw a constraint error on the loser. Make add idempotent: no-op the
      // insert on conflict and return the existing row instead of throwing.
      const inserted = db
        .insert(tracks)
        .values(row)
        .onConflictDoNothing({ target: tracks.filePath })
        .returning()
        .get();
      return inserted ?? db.select().from(tracks).where(eq(tracks.filePath, row.filePath)).get();
    },
    { schema: tracksAddArgs }
  );

  handle(
    T.addMany,
    async (_event, incoming: Omit<NewTrack, 'id'>[]) => {
      const start = Date.now();
      const db = getDatabase();
      const rows: NewTrack[] = incoming.map(t => ({ ...t, id: crypto.randomUUID() }));
      const chunks = Math.ceil(rows.length / 100);

      logger.info(
        `[database] tracks:add-many: inserting ${incoming.length} tracks (${chunks} chunks)`
      );

      // Insert in chunks to avoid exceeding SQLite's SQLITE_MAX_VARIABLE_NUMBER limit.
      // With 14 columns per track, chunks of 100 = 1400 params (well under the 32766 limit).
      const CHUNK_SIZE = 100;
      const results = db.transaction(tx => {
        const results = [];
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          results.push(...tx.insert(tracks).values(chunk).returning().all());
        }
        return results;
      });

      logger.info(
        `[database] tracks:add-many: inserted ${results.length} tracks in ${Date.now() - start}ms`
      );
      return results;
    },
    { schema: tracksAddManyArgs }
  );

  handle(
    T.remove,
    async (_event, id: string) => {
      const db = getDatabase();
      db.delete(tracks).where(eq(tracks.id, id)).run();
    },
    { schema: tracksRemoveArgs }
  );

  handle(
    T.removeMany,
    async (_event, ids: string[]) => {
      if (ids.length === 0) return;
      logger.info(`[database] tracks:remove-many: removing ${ids.length} tracks`);
      const start = Date.now();
      const db = getDatabase();
      const CHUNK_SIZE = 500;
      db.transaction(tx => {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          tx.delete(tracks).where(inArray(tracks.id, chunk)).run();
        }
      });
      logger.info(
        `[database] tracks:remove-many: removed ${ids.length} tracks in ${Date.now() - start}ms`
      );
      // Removed tracks may have been the only references to their album art
      // files. Re-prune off the critical path — failures are logged inside
      // pruneOrphanedAlbumArt and never propagate to the caller.
      pruneOrphanedAlbumArt().catch(err => {
        logger.warn('[database] post-remove-many prune failed:', err);
      });
    },
    { schema: tracksRemoveManyArgs }
  );

  handle(
    T.update,
    async (_event, id: string, data: Partial<NewTrack>) => {
      const db = getDatabase();
      return db.update(tracks).set(data).where(eq(tracks.id, id)).returning().get();
    },
    { schema: tracksUpdateArgs }
  );

  handle(
    T.updateMany,
    async (_event, updates: Array<{ id: string; data: Partial<NewTrack> }>) => {
      if (updates.length === 0) return [];
      logger.info(`[database] tracks:update-many: updating ${updates.length} tracks`);
      const db = getDatabase();
      return db.transaction(tx => {
        return updates.map(({ id, data }) =>
          tx.update(tracks).set(data).where(eq(tracks.id, id)).returning().get()
        );
      });
    },
    { schema: tracksUpdateManyArgs }
  );

  handle(
    T.toggleFavorite,
    async (_event, id: string) => {
      const db = getDatabase();
      return db
        .update(tracks)
        .set({ isFavorite: sql`NOT ${tracks.isFavorite}` })
        .where(eq(tracks.id, id))
        .returning()
        .get();
    },
    { schema: tracksToggleFavoriteArgs }
  );

  handle(
    T.getFavorites,
    async () => {
      const db = getDatabase();
      return db
        .select()
        .from(tracks)
        .where(eq(tracks.isFavorite, true))
        .orderBy(desc(tracks.createdAt))
        .all();
    },
    { schema: tracksGetFavoritesArgs }
  );

  handle(
    T.incrementPlayCount,
    async (_event, id: string) => {
      const db = getDatabase();
      return db
        .update(tracks)
        .set({ playCount: sql`${tracks.playCount} + 1` })
        .where(eq(tracks.id, id))
        .returning()
        .get();
    },
    { schema: tracksIncrementPlayCountArgs }
  );

  handle(
    T.exists,
    async (_event, filePath: string) => {
      const db = getDatabase();
      const row = db
        .select({ id: tracks.id })
        .from(tracks)
        .where(eq(tracks.filePath, filePath))
        .get();
      return !!row;
    },
    { schema: tracksExistsArgs }
  );

  handle(
    T.existsMany,
    async (_event, filePaths: string[]) => {
      if (filePaths.length === 0) return new Set<string>();
      const db = getDatabase();
      const CHUNK_SIZE = 500;
      const existing = new Set<string>();
      for (let i = 0; i < filePaths.length; i += CHUNK_SIZE) {
        const chunk = filePaths.slice(i, i + CHUNK_SIZE);
        const rows = db
          .select({ filePath: tracks.filePath })
          .from(tracks)
          .where(inArray(tracks.filePath, chunk))
          .all();
        for (const row of rows) existing.add(row.filePath);
      }
      return [...existing];
    },
    { schema: tracksExistsManyArgs }
  );
}

export function cleanupTrackHandlers(): void {
  ipcMain.removeHandler(T.getAll);
  ipcMain.removeHandler(T.add);
  ipcMain.removeHandler(T.addMany);
  ipcMain.removeHandler(T.remove);
  ipcMain.removeHandler(T.removeMany);
  ipcMain.removeHandler(T.update);
  ipcMain.removeHandler(T.updateMany);
  ipcMain.removeHandler(T.toggleFavorite);
  ipcMain.removeHandler(T.getFavorites);
  ipcMain.removeHandler(T.incrementPlayCount);
  ipcMain.removeHandler(T.exists);
  ipcMain.removeHandler(T.existsMany);
}
