import { ipcMain } from 'electron';
import {
  getDatabase,
  tracks,
  folders,
  playlists,
  playlistTracks,
  eq,
  and,
  desc,
  inArray,
  sql,
  type NewTrack,
  type NewFolder,
  type NewPlaylist,
} from '@shiranami/database';

export function registerDatabaseHandlers(): void {
  // ── Tracks ──────────────────────────────────────────────────────────

  ipcMain.handle('db:tracks:get-all', async () => {
    const db = getDatabase();
    return db.select().from(tracks).orderBy(desc(tracks.createdAt)).all();
  });

  ipcMain.handle('db:tracks:add', async (_event, track: Omit<NewTrack, 'id'>) => {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const row: NewTrack = { ...track, id };
    return db.insert(tracks).values(row).returning().get();
  });

  ipcMain.handle('db:tracks:add-many', async (_event, incoming: Omit<NewTrack, 'id'>[]) => {
    const db = getDatabase();
    const rows: NewTrack[] = incoming.map(t => ({ ...t, id: crypto.randomUUID() }));

    return db.transaction(tx => {
      return tx.insert(tracks).values(rows).returning().all();
    });
  });

  ipcMain.handle('db:tracks:remove', async (_event, id: string) => {
    const db = getDatabase();
    db.delete(tracks).where(eq(tracks.id, id)).run();
  });

  ipcMain.handle('db:tracks:remove-many', async (_event, ids: string[]) => {
    const db = getDatabase();
    db.transaction(tx => {
      tx.delete(tracks).where(inArray(tracks.id, ids)).run();
    });
  });

  ipcMain.handle('db:tracks:update', async (_event, id: string, data: Partial<NewTrack>) => {
    const db = getDatabase();
    return db.update(tracks).set(data).where(eq(tracks.id, id)).returning().get();
  });

  ipcMain.handle('db:tracks:toggle-favorite', async (_event, id: string) => {
    const db = getDatabase();
    return db
      .update(tracks)
      .set({ isFavorite: sql`NOT ${tracks.isFavorite}` })
      .where(eq(tracks.id, id))
      .returning()
      .get();
  });

  ipcMain.handle('db:tracks:get-favorites', async () => {
    const db = getDatabase();
    return db
      .select()
      .from(tracks)
      .where(eq(tracks.isFavorite, true))
      .orderBy(desc(tracks.createdAt))
      .all();
  });

  ipcMain.handle('db:tracks:increment-play-count', async (_event, id: string) => {
    const db = getDatabase();
    return db
      .update(tracks)
      .set({ playCount: sql`${tracks.playCount} + 1` })
      .where(eq(tracks.id, id))
      .returning()
      .get();
  });

  ipcMain.handle('db:tracks:exists', async (_event, filePath: string) => {
    const db = getDatabase();
    const row = db
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.filePath, filePath))
      .get();
    return !!row;
  });

  // ── Folders ─────────────────────────────────────────────────────────

  ipcMain.handle('db:folders:get-all', async () => {
    const db = getDatabase();
    return db.select().from(folders).all();
  });

  ipcMain.handle('db:folders:add', async (_event, folderPath: string) => {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const row: NewFolder = { id, path: folderPath };
    return db.insert(folders).values(row).returning().get();
  });

  ipcMain.handle('db:folders:remove', async (_event, id: string) => {
    const db = getDatabase();
    db.delete(folders).where(eq(folders.id, id)).run();
  });

  ipcMain.handle('db:folders:update-scanned', async (_event, id: string) => {
    const db = getDatabase();
    return db
      .update(folders)
      .set({ lastScanned: new Date().toISOString() })
      .where(eq(folders.id, id))
      .returning()
      .get();
  });

  // ── Playlists ───────────────────────────────────────────────────────

  ipcMain.handle('db:playlists:get-all', async () => {
    const db = getDatabase();
    return db.select().from(playlists).orderBy(desc(playlists.createdAt)).all();
  });

  ipcMain.handle('db:playlists:get', async (_event, id: string) => {
    const db = getDatabase();
    return db.select().from(playlists).where(eq(playlists.id, id)).get();
  });

  ipcMain.handle(
    'db:playlists:create',
    async (_event, data: { name: string; description?: string; coverArt?: string }) => {
      const db = getDatabase();
      const id = crypto.randomUUID();
      const row: NewPlaylist = { id, ...data };
      return db.insert(playlists).values(row).returning().get();
    },
  );

  ipcMain.handle(
    'db:playlists:update',
    async (
      _event,
      id: string,
      data: Partial<Pick<NewPlaylist, 'name' | 'description' | 'coverArt'>>,
    ) => {
      const db = getDatabase();
      return db
        .update(playlists)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(playlists.id, id))
        .returning()
        .get();
    },
  );

  ipcMain.handle('db:playlists:delete', async (_event, id: string) => {
    const db = getDatabase();
    db.delete(playlists).where(eq(playlists.id, id)).run();
  });

  ipcMain.handle('db:playlists:get-tracks', async (_event, playlistId: string) => {
    const db = getDatabase();
    return db
      .select()
      .from(tracks)
      .innerJoin(playlistTracks, eq(tracks.id, playlistTracks.trackId))
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position)
      .all();
  });

  ipcMain.handle(
    'db:playlists:add-track',
    async (_event, data: { playlistId: string; trackId: string }) => {
      const db = getDatabase();

      const existing = db
        .select({ id: playlistTracks.id })
        .from(playlistTracks)
        .where(
          and(
            eq(playlistTracks.playlistId, data.playlistId),
            eq(playlistTracks.trackId, data.trackId),
          ),
        )
        .get();

      if (existing) return existing;

      const maxRow = db
        .select({ maxPos: sql<number>`COALESCE(MAX(${playlistTracks.position}), -1)` })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, data.playlistId))
        .get();

      const nextPosition = (maxRow?.maxPos ?? -1) + 1;

      return db
        .insert(playlistTracks)
        .values({
          id: crypto.randomUUID(),
          playlistId: data.playlistId,
          trackId: data.trackId,
          position: nextPosition,
        })
        .returning()
        .get();
    },
  );

  ipcMain.handle(
    'db:playlists:remove-track',
    async (_event, data: { playlistId: string; trackId: string }) => {
      const db = getDatabase();
      db.delete(playlistTracks)
        .where(
          and(
            eq(playlistTracks.playlistId, data.playlistId),
            eq(playlistTracks.trackId, data.trackId),
          ),
        )
        .run();
    },
  );

  ipcMain.handle(
    'db:playlists:reorder',
    async (_event, data: { playlistId: string; trackIds: string[] }) => {
      const db = getDatabase();
      db.transaction(tx => {
        for (let i = 0; i < data.trackIds.length; i++) {
          tx.update(playlistTracks)
            .set({ position: i })
            .where(
              and(
                eq(playlistTracks.playlistId, data.playlistId),
                eq(playlistTracks.trackId, data.trackIds[i]),
              ),
            )
            .run();
        }
      });
    },
  );
}

export function cleanupDatabaseHandlers(): void {
  ipcMain.removeHandler('db:tracks:get-all');
  ipcMain.removeHandler('db:tracks:add');
  ipcMain.removeHandler('db:tracks:add-many');
  ipcMain.removeHandler('db:tracks:remove');
  ipcMain.removeHandler('db:tracks:remove-many');
  ipcMain.removeHandler('db:tracks:update');
  ipcMain.removeHandler('db:tracks:toggle-favorite');
  ipcMain.removeHandler('db:tracks:get-favorites');
  ipcMain.removeHandler('db:tracks:increment-play-count');
  ipcMain.removeHandler('db:tracks:exists');
  ipcMain.removeHandler('db:folders:get-all');
  ipcMain.removeHandler('db:folders:add');
  ipcMain.removeHandler('db:folders:remove');
  ipcMain.removeHandler('db:folders:update-scanned');
  ipcMain.removeHandler('db:playlists:get-all');
  ipcMain.removeHandler('db:playlists:get');
  ipcMain.removeHandler('db:playlists:create');
  ipcMain.removeHandler('db:playlists:update');
  ipcMain.removeHandler('db:playlists:delete');
  ipcMain.removeHandler('db:playlists:get-tracks');
  ipcMain.removeHandler('db:playlists:add-track');
  ipcMain.removeHandler('db:playlists:remove-track');
  ipcMain.removeHandler('db:playlists:reorder');
}
