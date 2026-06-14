import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { tracks, playHistory, eq, and, desc, sql, type NewPlayHistory } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM } from '@shiranami/shared';
import { handle } from '../with-ipc-handler';
import { submitPlay } from '../../scrobble/scrobbler';
import {
  historyRecordPlayArgs,
  historyGetRecentArgs,
  historyGetSummaryArgs,
  historyGetActivityArgs,
  historyGetHourlyActivityArgs,
  historyGetWeeklyInsightsArgs,
} from '../schemas/db-history';

/** A new session starts after this much idle time between consecutive plays. */
const SESSION_GAP_MS = 30 * 60 * 1000;

// The `tracks` table stores nullable artist/album, but the history wire types
// (ListeningHistoryEntry / ListeningStatsTrack / ListeningStatsArtist) declare
// them non-null and the renderer renders them directly. Collapse nulls to the
// shared UNKNOWN_ARTIST / UNKNOWN_ALBUM sentinels at the IPC boundary so the
// type is honest and the UI never shows a literal "null".

const H = IPC_CHANNELS.db.history;

function buildHistorySinceFilter(since?: string | null) {
  if (!since) return null;
  return sql`${playHistory.playedAt} >= ${since}`;
}

/**
 * Window filter with an optional exclusive upper bound. Used by the summary
 * handler so a "prior 7 days" window can be requested for the week-over-week
 * trend without overlapping the current window.
 */
function buildHistoryWindowFilter(since?: string | null, until?: string | null) {
  const sinceFilter = buildHistorySinceFilter(since);
  const untilFilter = until ? sql`${playHistory.playedAt} < ${until}` : null;
  if (sinceFilter && untilFilter) return and(sinceFilter, untilFilter);
  return sinceFilter ?? untilFilter;
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
      const source = data.source ?? 'library';

      const historyEntry = db.transaction(tx => {
        const row: NewPlayHistory = {
          id: crypto.randomUUID(),
          trackId: data.trackId,
          playedAt: new Date().toISOString(),
          playedSeconds,
          completionRatio,
          completed,
          source,
        };

        const entry = tx.insert(playHistory).values(row).returning().get();

        // RETURNING the updated track metadata avoids a second round-trip just to
        // read the tags the scrobbler needs.
        const trackMeta = tx
          .update(tracks)
          .set({
            playCount: sql`COALESCE(${tracks.playCount}, 0) + 1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tracks.id, data.trackId))
          .returning({
            title: tracks.title,
            artist: tracks.artist,
            album: tracks.album,
            duration: tracks.duration,
          })
          .get();

        return { entry, trackMeta };
      });

      // Scrobble this local play event (opt-in; main-only). Fire-and-forget so
      // it never blocks the record-play response or playback. Only 'library'
      // plays carry reliable artist/track tags worth scrobbling — radio entries
      // are skipped. The scrobbler itself no-ops when scrobbling is disabled.
      if (source === 'library' && historyEntry.trackMeta) {
        try {
          submitPlay({
            artist: historyEntry.trackMeta.artist ?? '',
            track: historyEntry.trackMeta.title,
            album: historyEntry.trackMeta.album,
            durationSeconds: historyEntry.trackMeta.duration ?? data.duration,
            playedSeconds,
          });
        } catch {
          // Scrobbling is best-effort; never let it affect record-play.
        }
      }

      return historyEntry.entry;
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

      const rows = (sinceFilter ? recentQuery.where(sinceFilter) : recentQuery)
        .limit(safeLimit)
        .all();
      return rows.map(row => ({
        ...row,
        artist: row.artist ?? UNKNOWN_ARTIST,
        album: row.album ?? UNKNOWN_ALBUM,
      }));
    },
    { schema: historyGetRecentArgs }
  );

  handle(
    H.getSummary,
    async (_event, options?: { since?: string | null; until?: string | null }) => {
      const db = getDatabase();
      const sinceFilter = buildHistoryWindowFilter(options?.since, options?.until);

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
        .all()
        .map(row => ({
          ...row,
          artist: row.artist ?? UNKNOWN_ARTIST,
          album: row.album ?? UNKNOWN_ALBUM,
        }));

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
        .all()
        .map(row => ({ ...row, artist: row.artist ?? UNKNOWN_ARTIST }));

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

  handle(
    H.getHourlyActivity,
    async (_event, options?: { since?: string | null }) => {
      const db = getDatabase();
      const sinceFilter = buildHistorySinceFilter(options?.since);

      // Bucket by LOCAL day-of-week and hour so "loudest at 23:00" reflects the
      // user's wall clock, not UTC. SQLite `%w` is Sunday-indexed (0=Sun..6=Sat);
      // the renderer remaps to a Mon-first grid.
      const dowExpression = sql<string>`strftime('%w', ${playHistory.playedAt}, 'localtime')`;
      const hourExpression = sql<string>`strftime('%H', ${playHistory.playedAt}, 'localtime')`;

      const hourlyQuery = db
        .select({
          dow: dowExpression,
          hour: hourExpression,
          playCount: sql<number>`COUNT(*)`,
          listenedMinutes: sql<number>`COALESCE(SUM(${playHistory.playedSeconds}) / 60.0, 0)`,
        })
        .from(playHistory)
        .groupBy(dowExpression, hourExpression);

      const rows = (sinceFilter ? hourlyQuery.where(sinceFilter) : hourlyQuery).all();

      return rows.map(row => ({
        dayOfWeek: Number(row.dow),
        hour: Number(row.hour),
        playCount: row.playCount,
        listenedMinutes: row.listenedMinutes,
      }));
    },
    { schema: historyGetHourlyActivityArgs }
  );

  handle(
    H.getWeeklyInsights,
    async (_event, options?: { since?: string | null }) => {
      const db = getDatabase();
      const sinceFilter = buildHistorySinceFilter(options?.since);

      // Top albums by play count — substitutes the mockup's genre "mood" card,
      // which genre data is too sparse to drive (research §10.2). Empty/unknown
      // album rows are filtered out so untagged libraries don't show a blank
      // album dominating the chart.
      const albumExpression = sql<string>`COALESCE(NULLIF(${tracks.album}, ''), '')`;
      // Group on the album-artist tag when present, else the album title alone
      // — NOT the track artist, which fragments an untagged various-artists
      // compilation into one entry per artist (#269). Same-titled albums by
      // different artists still stay separate when they carry album-artist tags.
      const albumArtistGroupKey = sql<string>`COALESCE(NULLIF(TRIM(${tracks.albumArtist}), ''), '')`;
      // Display falls back to a representative track artist so an untagged
      // album's card isn't blank.
      const albumArtistDisplay = sql<string>`COALESCE(NULLIF(TRIM(${tracks.albumArtist}), ''), NULLIF(${tracks.artist}, ''), ${UNKNOWN_ARTIST})`;
      const albumsQuery = db
        .select({
          album: albumExpression,
          artist: sql<string>`MAX(${albumArtistDisplay})`,
          albumArt: sql<string | null>`MAX(${tracks.albumArt})`,
          playCount: sql<number>`COUNT(*)`,
        })
        .from(playHistory)
        .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
        .groupBy(albumArtistGroupKey, albumExpression)
        .having(sql`${albumExpression} <> ''`);
      const topAlbums = (sinceFilter ? albumsQuery.where(sinceFilter) : albumsQuery)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(5)
        .all();

      // Gap-based session count: walk the ordered timestamps and start a new
      // session whenever the idle gap exceeds SESSION_GAP_MS. Lightweight — one
      // ascending scan of the windowed play_history timestamps.
      const playTimesQuery = db
        .select({ playedAt: playHistory.playedAt })
        .from(playHistory)
        .orderBy(playHistory.playedAt);
      const playTimes = (sinceFilter ? playTimesQuery.where(sinceFilter) : playTimesQuery).all();

      let sessionCount = 0;
      let lastMs = Number.NEGATIVE_INFINITY;
      for (const { playedAt } of playTimes) {
        const ms = new Date(playedAt).getTime();
        if (Number.isNaN(ms)) continue;
        if (ms - lastMs > SESSION_GAP_MS) sessionCount += 1;
        lastMs = ms;
      }

      return { sessionCount, topAlbums };
    },
    { schema: historyGetWeeklyInsightsArgs }
  );
}

export function cleanupHistoryHandlers(): void {
  ipcMain.removeHandler(H.recordPlay);
  ipcMain.removeHandler(H.getRecent);
  ipcMain.removeHandler(H.getSummary);
  ipcMain.removeHandler(H.getActivity);
  ipcMain.removeHandler(H.getHourlyActivity);
  ipcMain.removeHandler(H.getWeeklyInsights);
}
