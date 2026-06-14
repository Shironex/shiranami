import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { tracks, eq, desc, inArray, sql, type NewTrack } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { chunk } from '@shiranami/shared';
import { logger } from '../../app/logger';
import { handle } from '../with-ipc-handler';
import { pruneOrphanedAlbumArt } from '../../protocols/art-protocol';
import { emitSystemNotice } from '../../app/system-notice';
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
  tracksGetIdByPathArgs,
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
        for (const batch of chunk(rows, CHUNK_SIZE)) {
          // file_path is UNIQUE. Mirror `add` (see comment above) and no-op the
          // insert on conflict so a single duplicate filePath can't abort the
          // whole import transaction. `.returning()` then yields only the rows
          // actually inserted, which matches the existing contract (callers map
          // the returned rows into the library; already-present tracks are
          // intentionally omitted).
          results.push(
            ...tx
              .insert(tracks)
              .values(batch)
              .onConflictDoNothing({ target: tracks.filePath })
              .returning()
              .all()
          );
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
        for (const batch of chunk(ids, CHUNK_SIZE)) {
          tx.delete(tracks).where(inArray(tracks.id, batch)).run();
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
        // Surface to the renderer so a failing prune (e.g. locked cover cache)
        // isn't silent during a live session. Deduped/throttled by code.
        emitSystemNotice({ source: 'album-art', level: 'warn', code: 'albumArtPruneFailed' });
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
      if (updates.length === 0) return;
      logger.info(`[database] tracks:update-many: updating ${updates.length} tracks`);
      const db = getDatabase();

      // The sole consumer (metadata-enrich apply) re-reads the library via
      // getAll() right after, so it ignores the returned rows. Drop the
      // per-row RETURNING .get() round-trips and group ids by identical patch
      // shape, applying each distinct patch to all its ids in one inArray
      // UPDATE. Enrichment patches repeat heavily (e.g. a whole album getting
      // the same album/artist/year fix), so this collapses to a handful of
      // statements instead of one per track.
      const byPatch = new Map<string, { data: Partial<NewTrack>; ids: string[] }>();
      for (const { id, data } of updates) {
        // Strip undefined-valued keys before grouping: JSON.stringify drops
        // them silently, so { a: 1 } and { a: 1, b: undefined } would collide
        // into one group keyed on '{"a":1}'. Cleaning first keeps grouping
        // honest, and skipping empty patches avoids drizzle's "No values to
        // set" throw from .set({}) aborting the whole transaction.
        const cleanData = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined)
        ) as Partial<NewTrack>;
        if (Object.keys(cleanData).length === 0) continue;
        const key = JSON.stringify(cleanData);
        const group = byPatch.get(key);
        if (group) {
          group.ids.push(id);
        } else {
          byPatch.set(key, { data: cleanData, ids: [id] });
        }
      }

      const CHUNK_SIZE = 500;
      db.transaction(tx => {
        for (const { data, ids } of byPatch.values()) {
          for (const batch of chunk(ids, CHUNK_SIZE)) {
            tx.update(tracks).set(data).where(inArray(tracks.id, batch)).run();
          }
        }
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
      if (filePaths.length === 0) return [];
      const db = getDatabase();
      const CHUNK_SIZE = 500;
      const existing = new Set<string>();
      for (const batch of chunk(filePaths, CHUNK_SIZE)) {
        const rows = db
          .select({ filePath: tracks.filePath })
          .from(tracks)
          .where(inArray(tracks.filePath, batch))
          .all();
        for (const row of rows) existing.add(row.filePath);
      }
      return [...existing];
    },
    { schema: tracksExistsManyArgs }
  );

  handle(
    T.getIdByPath,
    async (_event, filePath: string) => {
      const db = getDatabase();
      const row = db
        .select({ id: tracks.id })
        .from(tracks)
        .where(eq(tracks.filePath, filePath))
        .get();
      return row?.id ?? null;
    },
    { schema: tracksGetIdByPathArgs }
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
  ipcMain.removeHandler(T.getIdByPath);
}
