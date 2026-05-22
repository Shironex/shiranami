import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { tracks, playHistory, eq, desc, sql, type NewPlayHistory } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { handle } from '../with-ipc-handler';
import {
  historyRecordPlayArgs,
  historyGetRecentArgs,
  historyGetSummaryArgs,
  historyGetActivityArgs,
} from '../schemas/db-history';

const H = IPC_CHANNELS.db.history;

function buildHistorySinceFilter(since?: string | null) {
  if (!since) return null;
  return sql`${playHistory.playedAt} >= ${since}`;
}

export function registerHistoryHandlers(): void {
  handle(
    H.recordPlay,
    async (
      _event,
      data: { trackId: string; playedSeconds: number; duration: number | null; source?: string }
    ) => {
      const db = getDatabase();
      const playedSeconds = Math.max(0, data.playedSeconds);
      const completionRatio =
        data.duration && data.duration > 0 ? Math.min(1, playedSeconds / data.duration) : 0;
      const completed = data.duration ? completionRatio >= 0.95 : false;

      return db.transaction(tx => {
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
    { schema: historyRecordPlayArgs }
  );

  handle(
    H.getRecent,
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

      return (sinceFilter ? recentQuery.where(sinceFilter) : recentQuery).limit(safeLimit).all();
    },
    { schema: historyGetRecentArgs }
  );

  handle(
    H.getSummary,
    async (_event, options?: { since?: string | null }) => {
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
    },
    { schema: historyGetSummaryArgs }
  );

  handle(
    H.getActivity,
    async (_event, options?: { since?: string | null }) => {
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
    },
    { schema: historyGetActivityArgs }
  );
}

export function cleanupHistoryHandlers(): void {
  ipcMain.removeHandler(H.recordPlay);
  ipcMain.removeHandler(H.getRecent);
  ipcMain.removeHandler(H.getSummary);
  ipcMain.removeHandler(H.getActivity);
}
