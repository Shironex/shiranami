import { ipcMain } from 'electron';
import {
  tracks,
  playHistory,
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
  type NewPlayHistory,
} from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';

function buildHistorySinceFilter(since?: string | null) {
  if (!since) return null;
  return sql`${playHistory.playedAt} >= ${since}`;
}

export function registerDatabaseHandlers(): void {
  // Tracks

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

    // Insert in chunks to avoid exceeding SQLite's SQLITE_MAX_VARIABLE_NUMBER limit.
    // With 14 columns per track, chunks of 100 = 1400 params (well under the 32766 limit).
    const CHUNK_SIZE = 100;
    return db.transaction(tx => {
      const results = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        results.push(...tx.insert(tracks).values(chunk).returning().all());
      }
      return results;
    });
  });

  ipcMain.handle('db:tracks:remove', async (_event, id: string) => {
    const db = getDatabase();
    db.delete(tracks).where(eq(tracks.id, id)).run();
  });

  ipcMain.handle('db:tracks:remove-many', async (_event, ids: string[]) => {
    if (ids.length === 0) return;
    const db = getDatabase();
    const CHUNK_SIZE = 500;
    db.transaction(tx => {
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        tx.delete(tracks).where(inArray(tracks.id, chunk)).run();
      }
    });
  });

  ipcMain.handle('db:tracks:update', async (_event, id: string, data: Partial<NewTrack>) => {
    const db = getDatabase();
    return db.update(tracks).set(data).where(eq(tracks.id, id)).returning().get();
  });

  ipcMain.handle(
    'db:tracks:update-many',
    async (_event, updates: Array<{ id: string; data: Partial<NewTrack> }>) => {
      if (updates.length === 0) return [];
      const db = getDatabase();
      return db.transaction(tx => {
        return updates.map(({ id, data }) =>
          tx.update(tracks).set(data).where(eq(tracks.id, id)).returning().get()
        );
      });
    }
  );

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

  ipcMain.handle('db:tracks:exists-many', async (_event, filePaths: string[]) => {
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
  });

  ipcMain.handle(
    'db:history:record-play',
    async (
      _event,
      data: { trackId: string; playedSeconds: number; duration: number | null; source?: string },
    ) => {
      const db = getDatabase();
      const playedSeconds = Math.max(0, data.playedSeconds);
      const completionRatio = data.duration && data.duration > 0
        ? Math.min(1, playedSeconds / data.duration)
        : 0;
      const completed = data.duration ? completionRatio >= 0.95 : false;

      return db.transaction((tx) => {
        const row: NewPlayHistory = {
          id: crypto.randomUUID(),
          trackId: data.trackId,
          playedAt: new Date().toISOString(),
          playedSeconds,
          completionRatio,
          completed,
          source: data.source ?? 'library',
        };

        const historyEntry = tx.insert(playHistory).values(row).returning().get();

        tx.update(tracks)
          .set({
            playCount: sql`COALESCE(${tracks.playCount}, 0) + 1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tracks.id, data.trackId))
          .run();

        return historyEntry;
      });
    },
  );

  ipcMain.handle(
    'db:history:get-recent',
    async (_event, options?: { limit?: number; since?: string | null }) => {
      const db = getDatabase();
      const safeLimit = Math.max(1, Math.min(100, options?.limit ?? 30));
      const sinceFilter = buildHistorySinceFilter(options?.since);

      const recentQuery = db
        .select({
          id: playHistory.id,
          trackId: playHistory.trackId,
          playedAt: playHistory.playedAt,
          playedSeconds: playHistory.playedSeconds,
          completionRatio: playHistory.completionRatio,
          completed: playHistory.completed,
          source: playHistory.source,
          title: tracks.title,
          artist: tracks.artist,
          album: tracks.album,
          albumArt: tracks.albumArt,
          duration: tracks.duration,
        })
        .from(playHistory)
        .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
        .orderBy(desc(playHistory.playedAt));

      return (sinceFilter ? recentQuery.where(sinceFilter) : recentQuery)
        .limit(safeLimit)
        .all();
    },
  );

  ipcMain.handle('db:history:get-summary', async (_event, options?: { since?: string | null }) => {
    const db = getDatabase();
    const sinceFilter = buildHistorySinceFilter(options?.since);

    const totalsQuery = db
      .select({
        totalPlays: sql<number>`COUNT(*)`,
        totalMinutes: sql<number>`COALESCE(SUM(${playHistory.playedSeconds}) / 60.0, 0)`,
        uniqueTracks: sql<number>`COUNT(DISTINCT ${playHistory.trackId})`,
        uniqueArtists: sql<number>`COUNT(DISTINCT ${tracks.artist})`,
        completedPlays: sql<number>`COALESCE(SUM(CASE WHEN ${playHistory.completed} THEN 1 ELSE 0 END), 0)`,
      })
      .from(playHistory)
      .innerJoin(tracks, eq(playHistory.trackId, tracks.id));
    const totals = (sinceFilter ? totalsQuery.where(sinceFilter) : totalsQuery).get();

    const topTracksQuery = db
      .select({
        trackId: tracks.id,
        title: tracks.title,
        artist: tracks.artist,
        album: tracks.album,
        albumArt: tracks.albumArt,
        playCount: sql<number>`COUNT(*)`,
        listenedSeconds: sql<number>`COALESCE(SUM(${playHistory.playedSeconds}), 0)`,
        lastPlayedAt: sql<string>`MAX(${playHistory.playedAt})`,
      })
      .from(playHistory)
      .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
      .groupBy(tracks.id);
    const topTracks = (sinceFilter ? topTracksQuery.where(sinceFilter) : topTracksQuery)
      .orderBy(desc(sql`COUNT(*)`), desc(sql`MAX(${playHistory.playedAt})`))
      .limit(5)
      .all();

    const topArtistsQuery = db
      .select({
        artist: tracks.artist,
        playCount: sql<number>`COUNT(*)`,
        listenedSeconds: sql<number>`COALESCE(SUM(${playHistory.playedSeconds}), 0)`,
      })
      .from(playHistory)
      .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
      .groupBy(tracks.artist);
    const topArtists = (sinceFilter ? topArtistsQuery.where(sinceFilter) : topArtistsQuery)
      .orderBy(desc(sql`COUNT(*)`), desc(sql`COALESCE(SUM(${playHistory.playedSeconds}), 0)`))
      .limit(5)
      .all();

    return {
      totalPlays: totals?.totalPlays ?? 0,
      totalMinutes: totals?.totalMinutes ?? 0,
      uniqueTracks: totals?.uniqueTracks ?? 0,
      uniqueArtists: totals?.uniqueArtists ?? 0,
      completedPlays: totals?.completedPlays ?? 0,
      topTracks,
      topArtists,
    };
  });

  ipcMain.handle('db:history:get-activity', async (_event, options?: { since?: string | null }) => {
    const db = getDatabase();
    const sinceFilter = buildHistorySinceFilter(options?.since);
    const dayExpression = sql<string>`substr(${playHistory.playedAt}, 1, 10)`;

    const activityQuery = db
      .select({
        date: dayExpression,
        playCount: sql<number>`COUNT(*)`,
        listenedMinutes: sql<number>`COALESCE(SUM(${playHistory.playedSeconds}) / 60.0, 0)`,
      })
      .from(playHistory)
      .groupBy(dayExpression);

    return (sinceFilter ? activityQuery.where(sinceFilter) : activityQuery)
      .orderBy(dayExpression)
      .all();
  });

  // Folders

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

  // Playlists

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
    const rows = db
      .select()
      .from(tracks)
      .innerJoin(playlistTracks, eq(tracks.id, playlistTracks.trackId))
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position)
      .all();
    return rows.map((row) => row.tracks);
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
    'db:playlists:create-with-tracks',
    async (_event, data: { name: string; description?: string; trackIds: string[] }) => {
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
  ipcMain.removeHandler('db:tracks:update-many');
  ipcMain.removeHandler('db:tracks:toggle-favorite');
  ipcMain.removeHandler('db:tracks:get-favorites');
  ipcMain.removeHandler('db:tracks:increment-play-count');
  ipcMain.removeHandler('db:tracks:exists');
  ipcMain.removeHandler('db:tracks:exists-many');
  ipcMain.removeHandler('db:history:record-play');
  ipcMain.removeHandler('db:history:get-recent');
  ipcMain.removeHandler('db:history:get-summary');
  ipcMain.removeHandler('db:history:get-activity');
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
  ipcMain.removeHandler('db:playlists:create-with-tracks');
  ipcMain.removeHandler('db:playlists:remove-track');
  ipcMain.removeHandler('db:playlists:reorder');
}
