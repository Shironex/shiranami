import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import {
  tracks,
  playlists,
  playlistTracks,
  eq,
  and,
  desc,
  inArray,
  sql,
  type NewPlaylist,
} from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { logger } from '../../logger';
import { handle } from '../with-ipc-handler';
import {
  playlistsGetAllArgs,
  playlistsGetArgs,
  playlistsCreateArgs,
  playlistsCreateWithTracksArgs,
  playlistsUpdateArgs,
  playlistsDeleteArgs,
  playlistsGetTracksArgs,
  playlistsAddTrackArgs,
  playlistsRemoveTrackArgs,
  playlistsGetPlaylistsForTracksArgs,
  playlistsReorderArgs,
} from '../schemas/db-playlists';

const P = IPC_CHANNELS.db.playlists;

export function registerPlaylistHandlers(): void {
  handle(
    P.getAll,
    async () => {
      const db = getDatabase();
      return db.select().from(playlists).orderBy(desc(playlists.createdAt)).all();
    },
    { schema: playlistsGetAllArgs }
  );

  handle(
    P.get,
    async (_event, id: string) => {
      const db = getDatabase();
      return db.select().from(playlists).where(eq(playlists.id, id)).get();
    },
    { schema: playlistsGetArgs }
  );

  handle(
    P.create,
    async (_event, data: { name: string; description?: string; coverArt?: string }) => {
      logger.info(`[database] playlists:create: "${data.name}"`);
      const db = getDatabase();
      const id = crypto.randomUUID();
      const row: NewPlaylist = { id, ...data };
      return db.insert(playlists).values(row).returning().get();
    },
    { schema: playlistsCreateArgs }
  );

  handle(
    P.update,
    async (
      _event,
      id: string,
      data: Partial<Pick<NewPlaylist, 'name' | 'description' | 'coverArt'>>
    ) => {
      const db = getDatabase();
      return db
        .update(playlists)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(playlists.id, id))
        .returning()
        .get();
    },
    { schema: playlistsUpdateArgs }
  );

  handle(
    P.delete,
    async (_event, id: string) => {
      logger.info(`[database] playlists:delete: ${id}`);
      const db = getDatabase();
      db.delete(playlists).where(eq(playlists.id, id)).run();
    },
    { schema: playlistsDeleteArgs }
  );

  handle(
    P.getTracks,
    async (_event, playlistId: string) => {
      const db = getDatabase();
      const rows = db
        .select()
        .from(tracks)
        .innerJoin(playlistTracks, eq(tracks.id, playlistTracks.trackId))
        .where(eq(playlistTracks.playlistId, playlistId))
        .orderBy(playlistTracks.position)
        .all();
      return rows.map(row => row.tracks);
    },
    { schema: playlistsGetTracksArgs }
  );

  handle(
    P.addTrack,
    async (_event, data: { playlistId: string; trackId: string }) => {
      const db = getDatabase();

      // Wrap the existence check + MAX(position) read + insert in a single
      // transaction so the read-modify-write is atomic. The body is synchronous
      // today (no interleave), but this guarantees two adds can't compute the
      // same next position if an await is ever introduced, and pairs with the
      // UNIQUE(playlist_id, track_id) constraint to keep membership idempotent.
      return db.transaction(tx => {
        const existing = tx
          .select({ id: playlistTracks.id })
          .from(playlistTracks)
          .where(
            and(
              eq(playlistTracks.playlistId, data.playlistId),
              eq(playlistTracks.trackId, data.trackId)
            )
          )
          .get();

        if (existing) return existing;

        const maxRow = tx
          .select({ maxPos: sql<number>`COALESCE(MAX(${playlistTracks.position}), -1)` })
          .from(playlistTracks)
          .where(eq(playlistTracks.playlistId, data.playlistId))
          .get();

        const nextPosition = (maxRow?.maxPos ?? -1) + 1;

        return tx
          .insert(playlistTracks)
          .values({
            id: crypto.randomUUID(),
            playlistId: data.playlistId,
            trackId: data.trackId,
            position: nextPosition,
          })
          .returning()
          .get();
      });
    },
    { schema: playlistsAddTrackArgs }
  );

  handle(
    P.createWithTracks,
    async (_event, data: { name: string; description?: string; trackIds: string[] }) => {
      logger.info(
        `[database] playlists:create-with-tracks: "${data.name}" (${data.trackIds.length} tracks)`
      );
      const db = getDatabase();
      return db.transaction(tx => {
        const playlistId = crypto.randomUUID();
        const row: NewPlaylist = { id: playlistId, name: data.name, description: data.description };
        const playlist = tx.insert(playlists).values(row).returning().get();

        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.trackIds.length; i += CHUNK_SIZE) {
          const chunk = data.trackIds.slice(i, i + CHUNK_SIZE);
          const values = chunk.map((trackId, idx) => ({
            id: crypto.randomUUID(),
            playlistId,
            trackId,
            position: i + idx,
          }));
          tx.insert(playlistTracks).values(values).run();
        }

        return playlist;
      });
    },
    { schema: playlistsCreateWithTracksArgs }
  );

  handle(
    P.removeTrack,
    async (_event, data: { playlistId: string; trackId: string }) => {
      const db = getDatabase();
      db.delete(playlistTracks)
        .where(
          and(
            eq(playlistTracks.playlistId, data.playlistId),
            eq(playlistTracks.trackId, data.trackId)
          )
        )
        .run();
    },
    { schema: playlistsRemoveTrackArgs }
  );

  handle(
    P.getPlaylistsForTracks,
    async (_event, trackIds: string[]) => {
      const db = getDatabase();
      const uniqueTrackIds = [...new Set(trackIds)];
      if (uniqueTrackIds.length === 0) return [];

      const rows = db
        .select({ playlistId: playlistTracks.playlistId })
        .from(playlistTracks)
        .where(inArray(playlistTracks.trackId, uniqueTrackIds))
        .groupBy(playlistTracks.playlistId)
        .having(sql`COUNT(DISTINCT ${playlistTracks.trackId}) = ${uniqueTrackIds.length}`)
        .all();

      return rows.map(r => r.playlistId);
    },
    { schema: playlistsGetPlaylistsForTracksArgs }
  );

  handle(
    P.reorder,
    async (_event, data: { playlistId: string; trackIds: string[] }) => {
      const db = getDatabase();
      db.transaction(tx => {
        // Set-based reorder: one CASE-when-then update per chunk instead of a
        // statement per track, so a 1k-track drag-drop runs ~10 statements
        // rather than 1k. Only `position` changes — row ids are preserved.
        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.trackIds.length; i += CHUNK_SIZE) {
          const chunk = data.trackIds.slice(i, i + CHUNK_SIZE);
          const cases = chunk.map((trackId, idx) => sql`WHEN ${trackId} THEN ${i + idx}`);
          tx.update(playlistTracks)
            .set({ position: sql`CASE ${playlistTracks.trackId} ${sql.join(cases, sql` `)} END` })
            .where(
              and(
                eq(playlistTracks.playlistId, data.playlistId),
                inArray(playlistTracks.trackId, chunk)
              )
            )
            .run();
        }
      });
    },
    { schema: playlistsReorderArgs }
  );
}

export function cleanupPlaylistHandlers(): void {
  ipcMain.removeHandler(P.getAll);
  ipcMain.removeHandler(P.get);
  ipcMain.removeHandler(P.create);
  ipcMain.removeHandler(P.update);
  ipcMain.removeHandler(P.delete);
  ipcMain.removeHandler(P.getTracks);
  ipcMain.removeHandler(P.addTrack);
  ipcMain.removeHandler(P.createWithTracks);
  ipcMain.removeHandler(P.removeTrack);
  ipcMain.removeHandler(P.getPlaylistsForTracks);
  ipcMain.removeHandler(P.reorder);
}
