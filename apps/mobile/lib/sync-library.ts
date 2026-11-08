import type { SQLiteDatabase } from 'expo-sqlite';
import type { HistoryEntry, ManifestTrack, SyncPlaylist } from '@shiranami/contracts/sync';
import { randomUUID } from '@/lib/utils';

/**
 * The database half of LAN sync v0: one way, desktop to phone. Desktop tracks
 * become rows with source 'desktop' (missing until their audio is on the
 * phone), a track the phone already holds is linked by content hash instead
 * of downloaded again, and playlists, favorites and history are merged in.
 */

/** A `tracks` row as far as matching a manifest cares. */
export interface LinkRow {
  id: string;
  desktop_id: string | null;
  content_hash: string | null;
  source: string;
  missing: number;
}

/** A track whose audio has to come over: the row it lands in, and the manifest entry. */
export interface AudioJob {
  rowId: string;
  track: ManifestTrack;
}

export interface ManifestPlan {
  /** Desktop tracks with no row on the phone: a pending row is added for each. */
  inserts: { rowId: string; track: ManifestTrack }[];
  /** Rows the phone already had, matched by content hash, that gain the desktop link. */
  links: { rowId: string; track: ManifestTrack }[];
  /** Rows the sync made earlier whose tags are refreshed from the desktop. */
  updates: { rowId: string; track: ManifestTrack }[];
  /** Audio to download, in manifest order. */
  downloads: AudioJob[];
}

const LINK_COLUMNS = 'id, desktop_id, content_hash, source, missing';

/**
 * Matches the manifest against the phone's rows. By desktop id first (a row
 * this sync made or linked before), then by content hash, preferring a row
 * whose file is there. Audio is only fetched for a row without a file, or for
 * a copy from the desktop whose audio has changed there; a tag edit on the
 * desktop only refreshes the row.
 */
export function planManifest(rows: LinkRow[], tracks: ManifestTrack[]): ManifestPlan {
  const byDesktop = new Map<string, LinkRow>();
  const byHash = new Map<string, LinkRow>();
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.id);
    if (row.desktop_id) byDesktop.set(row.desktop_id, row);
    if (!row.content_hash) continue;
    const seen = byHash.get(row.content_hash);
    if (!seen || (seen.missing && !row.missing)) byHash.set(row.content_hash, row);
  }

  const plan: ManifestPlan = { inserts: [], links: [], updates: [], downloads: [] };
  const claimed = new Set<string>();
  for (const track of tracks) {
    const downloadable = track.sizeBytes != null;
    let row = byDesktop.get(track.id);
    if (!row && track.contentHash) {
      const candidate = byHash.get(track.contentHash);
      // One desktop track per phone row: a second desktop copy of the same
      // song gets its own row rather than stealing the first one's link.
      if (candidate && !candidate.desktop_id && !claimed.has(candidate.id)) {
        row = candidate;
        plan.links.push({ rowId: row.id, track });
      }
    }
    if (!row) {
      const rowId = ids.has(track.id) ? randomUUID() : track.id;
      ids.add(rowId);
      plan.inserts.push({ rowId, track });
      if (downloadable) plan.downloads.push({ rowId, track });
      continue;
    }
    claimed.add(row.id);
    if (row.source === 'desktop') plan.updates.push({ rowId: row.id, track });
    const audioChanged =
      row.source === 'desktop' &&
      !!track.contentHash &&
      !!row.content_hash &&
      track.contentHash !== row.content_hash;
    if (downloadable && (row.missing || audioChanged)) {
      plan.downloads.push({ rowId: row.id, track });
    }
  }
  return plan;
}

function tagValues(track: ManifestTrack) {
  return [
    track.title,
    track.artist ?? track.albumArtist,
    track.album,
    track.albumArtist,
    track.trackNumber,
    track.year,
    track.genre,
    track.duration,
  ];
}

const TAG_COLUMNS =
  'title = ?, artist = COALESCE(?, artist), album = COALESCE(?, album), album_artist = ?, track_number = ?, year = ?, genre = ?, duration = ?';

/** Writes a manifest plan in one transaction. Returns the plan for the downloads. */
export async function applyManifest(
  db: SQLiteDatabase,
  tracks: ManifestTrack[]
): Promise<ManifestPlan> {
  const rows = await db.getAllAsync<LinkRow>(`SELECT ${LINK_COLUMNS} FROM tracks`);
  const plan = planManifest(rows, tracks);
  await db.withTransactionAsync(async () => {
    for (const { rowId, track } of plan.inserts) {
      // Pending until its audio lands: the placeholder path keeps file_path
      // unique and is never played, since missing rows are not loaded.
      await db.runAsync(
        `INSERT OR IGNORE INTO tracks (id, file_path, title, artist, album, album_artist,
           track_number, year, genre, duration, is_favorite, play_count, content_hash, file_size,
           source, missing, desktop_id)
         VALUES (?, ?, ?, COALESCE(?, 'Unknown Artist'), COALESCE(?, 'Unknown Album'), ?, ?, ?, ?, ?,
           ?, ?, ?, ?, 'desktop', 1, ?)`,
        [
          rowId,
          pendingPath(track.id),
          ...tagValues(track),
          track.isFavorite ? 1 : 0,
          track.playCount,
          track.contentHash,
          track.sizeBytes,
          track.id,
        ]
      );
    }
    for (const { rowId, track } of plan.links) {
      await db.runAsync('UPDATE tracks SET desktop_id = ? WHERE id = ?', [track.id, rowId]);
    }
    for (const { rowId, track } of plan.updates) {
      await db.runAsync(
        `UPDATE tracks SET ${TAG_COLUMNS}, updated_at = datetime('now') WHERE id = ?`,
        [...tagValues(track), rowId]
      );
    }
  });
  return plan;
}

/** The `file_path` of a desktop row whose audio has not arrived yet. */
export function pendingPath(desktopId: string): string {
  return `shiranami-desktop:${desktopId}`;
}

/** Desktop track id to phone row id, for every linked row. */
export async function loadDesktopIds(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ id: string; desktop_id: string }>(
    'SELECT id, desktop_id FROM tracks WHERE desktop_id IS NOT NULL'
  );
  return new Map(rows.map(row => [row.desktop_id, row.id]));
}

/** Points a row at its downloaded audio and makes it playable. */
export async function completeDownload(
  db: SQLiteDatabase,
  job: AudioJob,
  fileUri: string,
  sizeBytes: number
): Promise<void> {
  await db.runAsync(
    `UPDATE tracks SET file_path = ?, file_size = ?, content_hash = COALESCE(?, content_hash),
       desktop_version = ?, desktop_id = ?, source = 'desktop', missing = 0,
       updated_at = datetime('now')
     WHERE id = ?`,
    [fileUri, sizeBytes, job.track.contentHash, job.track.fileVersion, job.track.id, job.rowId]
  );
}

/** Gives every linked row without a cover the one saved for its artwork hash. */
export async function applyArtwork(
  db: SQLiteDatabase,
  covers: { desktopId: string; uri: string }[]
): Promise<void> {
  if (covers.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const { desktopId, uri } of covers) {
      await db.runAsync(
        'UPDATE tracks SET album_art = ? WHERE desktop_id = ? AND album_art IS NULL',
        [uri, desktopId]
      );
    }
  });
}

/**
 * Ids per `IN (...)` query. SQLite caps bind parameters per statement (999 on
 * older builds), and a desktop can send tens of thousands of plays.
 */
const SQL_CHUNK = 500;

const placeholders = (values: unknown[]) => values.map(() => '?').join(', ');

export interface MergeCounts {
  favorites: number;
  playlists: number;
  history: number;
}

/**
 * Favorites from the desktop are added to the phone's; a heart set on the
 * phone is never taken away (v0 is one way, and removing would lose it).
 * Returns how many desktop favorites the phone now has.
 */
export async function mergeFavorites(
  db: SQLiteDatabase,
  desktopTrackIds: string[],
  ids: Map<string, string>
): Promise<number> {
  const rowIds = desktopTrackIds.map(id => ids.get(id)).filter((id): id is string => !!id);
  await db.withTransactionAsync(async () => {
    for (let start = 0; start < rowIds.length; start += SQL_CHUNK) {
      const slice = rowIds.slice(start, start + SQL_CHUNK);
      await db.runAsync(
        `UPDATE tracks SET is_favorite = 1 WHERE is_favorite = 0 AND id IN (${placeholders(slice)})`,
        slice
      );
    }
  });
  return rowIds.length;
}

/**
 * Desktop playlists land under their desktop id. One the phone already has
 * from an earlier sync takes the desktop's name and order (the desktop wins,
 * v0 is one way); songs the phone cannot map are left out. Playlists made on
 * the phone are never touched, and a playlist deleted on the desktop stays on
 * the phone.
 */
export async function mergePlaylists(
  db: SQLiteDatabase,
  playlists: SyncPlaylist[],
  ids: Map<string, string>
): Promise<number> {
  await db.withTransactionAsync(async () => {
    for (const playlist of playlists) {
      await db.runAsync(
        `INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
           updated_at = datetime('now')`,
        [playlist.id, playlist.name, playlist.description]
      );
      await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlist.id]);
      const seen = new Set<string>();
      let position = 0;
      for (const desktopId of playlist.trackIds) {
        const rowId = ids.get(desktopId);
        if (!rowId || seen.has(rowId)) continue;
        seen.add(rowId);
        await db.runAsync(
          'INSERT INTO playlist_tracks (id, playlist_id, track_id, position) VALUES (?, ?, ?, ?)',
          [randomUUID(), playlist.id, rowId, position++]
        );
      }
    }
  });
  return playlists.length;
}

/** `2026-11-08T21:04:05.123Z` as SQLite's `datetime('now')` writes it, so plays sort together. */
export function toSqliteTime(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Date(time).toISOString().slice(0, 19).replace('T', ' ');
}

/** Adds desktop plays by their id; a play already on the phone is skipped. Returns how many were new. */
export async function mergeHistory(
  db: SQLiteDatabase,
  entries: HistoryEntry[],
  ids: Map<string, string>
): Promise<number> {
  const known = new Set<string>();
  for (let start = 0; start < entries.length; start += SQL_CHUNK) {
    const slice = entries.slice(start, start + SQL_CHUNK).map(entry => entry.id);
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM play_history WHERE id IN (${placeholders(slice)})`,
      slice
    );
    for (const row of rows) known.add(row.id);
  }
  let added = 0;
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      const rowId = ids.get(entry.trackId);
      if (!rowId || known.has(entry.id)) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO play_history (id, track_id, played_at, played_seconds,
           completion_ratio, completed, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          rowId,
          toSqliteTime(entry.playedAt),
          entry.playedSeconds ?? 0,
          entry.completionRatio ?? 0,
          entry.completed ? 1 : 0,
          entry.source,
        ]
      );
      added++;
    }
  });
  return added;
}
