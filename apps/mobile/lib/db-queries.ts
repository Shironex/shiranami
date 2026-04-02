import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';

// Types matching desktop schema (snake_case DB -> camelCase TS)

export interface Track {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  duration: number | null;
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  albumArt: string | null;
  isFavorite: boolean;
  playCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  coverArt: string | null;
  createdAt: string;
  updatedAt: string;
  trackCount?: number;
}

export interface PlaylistTrack {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
}

export interface RadioFavorite {
  id: string;
  stationUuid: string;
  name: string;
  url: string;
  urlResolved: string;
  homepage: string | null;
  favicon: string | null;
  country: string | null;
  countryCode: string | null;
  language: string | null;
  codec: string | null;
  bitrate: number | null;
  tags: string | null;
  createdAt: string;
}

export interface PlayHistoryEntry {
  id: string;
  trackId: string;
  playedAt: string;
  playedSeconds: number;
  completionRatio: number;
  completed: boolean;
  source: string;
}

interface RawTrack {
  id: string;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  duration: number | null;
  genre: string | null;
  year: number | null;
  track_number: number | null;
  album_art: string | null;
  is_favorite: number;
  play_count: number;
  created_at: string;
  updated_at: string;
}

function mapTrack(row: RawTrack): Track {
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    artist: row.artist ?? 'Unknown Artist',
    album: row.album ?? 'Unknown Album',
    duration: row.duration,
    genre: row.genre,
    year: row.year,
    trackNumber: row.track_number,
    albumArt: row.album_art,
    isFavorite: !!row.is_favorite,
    playCount: row.play_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==========================================
// Tracks
// ==========================================

export function useTracks() {
  const db = useSQLiteContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await db.getAllAsync<RawTrack>(
      'SELECT * FROM tracks ORDER BY created_at DESC',
    );
    setTracks(rows.map(mapTrack));
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (track: Omit<Track, 'id' | 'createdAt' | 'updatedAt' | 'isFavorite' | 'playCount'>) => {
      const id = randomUUID();
      await db.runAsync(
        `INSERT INTO tracks (id, file_path, title, artist, album, duration, genre, year, track_number, album_art)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, track.filePath, track.title, track.artist, track.album, track.duration,
         track.genre, track.year, track.trackNumber, track.albumArt],
      );
      await refresh();
      return id;
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.runAsync('DELETE FROM tracks WHERE id = ?', [id]);
      await refresh();
    },
    [db, refresh],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      await db.runAsync(
        'UPDATE tracks SET is_favorite = NOT is_favorite, updated_at = datetime(\'now\') WHERE id = ?',
        [id],
      );
      await refresh();
    },
    [db, refresh],
  );

  const incrementPlayCount = useCallback(
    async (id: string) => {
      await db.runAsync(
        'UPDATE tracks SET play_count = play_count + 1, updated_at = datetime(\'now\') WHERE id = ?',
        [id],
      );
    },
    [db],
  );

  const getFavorites = useCallback(async () => {
    const rows = await db.getAllAsync<RawTrack>(
      'SELECT * FROM tracks WHERE is_favorite = 1 ORDER BY updated_at DESC',
    );
    return rows.map(mapTrack);
  }, [db]);

  return { tracks, loading, refresh, add, remove, toggleFavorite, incrementPlayCount, getFavorites };
}

// ==========================================
// Playlists
// ==========================================

export function usePlaylists() {
  const db = useSQLiteContext();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await db.getAllAsync<Playlist & { track_count: number }>(
      `SELECT p.*, COUNT(pt.id) as track_count
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
    );
    setPlaylists(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        coverArt: r.coverArt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        trackCount: r.track_count,
      })),
    );
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string, description?: string) => {
      const id = randomUUID();
      await db.runAsync(
        'INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)',
        [id, name, description ?? null],
      );
      await refresh();
      return id;
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
      await refresh();
    },
    [db, refresh],
  );

  const addTrack = useCallback(
    async (playlistId: string, trackId: string) => {
      const id = randomUUID();
      const maxPos = await db.getFirstAsync<{ max_pos: number | null }>(
        'SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?',
        [playlistId],
      );
      const position = (maxPos?.max_pos ?? -1) + 1;
      await db.runAsync(
        'INSERT OR IGNORE INTO playlist_tracks (id, playlist_id, track_id, position) VALUES (?, ?, ?, ?)',
        [id, playlistId, trackId, position],
      );
      await db.runAsync(
        'UPDATE playlists SET updated_at = datetime(\'now\') WHERE id = ?',
        [playlistId],
      );
    },
    [db],
  );

  const removeTrack = useCallback(
    async (playlistId: string, trackId: string) => {
      await db.runAsync(
        'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?',
        [playlistId, trackId],
      );
    },
    [db],
  );

  const getTracks = useCallback(
    async (playlistId: string): Promise<Track[]> => {
      const rows = await db.getAllAsync<RawTrack>(
        `SELECT t.* FROM tracks t
         JOIN playlist_tracks pt ON pt.track_id = t.id
         WHERE pt.playlist_id = ?
         ORDER BY pt.position ASC`,
        [playlistId],
      );
      return rows.map(mapTrack);
    },
    [db],
  );

  const reorder = useCallback(
    async (playlistId: string, trackIds: string[]) => {
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < trackIds.length; i++) {
          await db.runAsync(
            'UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?',
            [i, playlistId, trackIds[i]],
          );
        }
      });
    },
    [db],
  );

  return { playlists, loading, refresh, create, remove, addTrack, removeTrack, getTracks, reorder };
}

// ==========================================
// Play History
// ==========================================

export function useHistory() {
  const db = useSQLiteContext();

  const recordPlay = useCallback(
    async (trackId: string, playedSeconds: number, completionRatio: number) => {
      const id = randomUUID();
      const completed = completionRatio >= 0.5 || playedSeconds >= 30;
      await db.runAsync(
        `INSERT INTO play_history (id, track_id, played_seconds, completion_ratio, completed, source)
         VALUES (?, ?, ?, ?, ?, 'library')`,
        [id, trackId, playedSeconds, completionRatio, completed ? 1 : 0],
      );
    },
    [db],
  );

  const getRecent = useCallback(
    async (limit = 50): Promise<(PlayHistoryEntry & { track: Track })[]> => {
      const rows = await db.getAllAsync<RawTrack & {
        ph_id: string;
        ph_played_at: string;
        ph_played_seconds: number;
        ph_completion_ratio: number;
        ph_completed: number;
        ph_source: string;
      }>(
        `SELECT t.*, ph.id as ph_id, ph.played_at as ph_played_at,
                ph.played_seconds as ph_played_seconds, ph.completion_ratio as ph_completion_ratio,
                ph.completed as ph_completed, ph.source as ph_source
         FROM play_history ph
         JOIN tracks t ON t.id = ph.track_id
         ORDER BY ph.played_at DESC
         LIMIT ?`,
        [limit],
      );
      return rows.map(r => ({
        id: r.ph_id,
        trackId: r.id,
        playedAt: r.ph_played_at,
        playedSeconds: r.ph_played_seconds,
        completionRatio: r.ph_completion_ratio,
        completed: !!r.ph_completed,
        source: r.ph_source,
        track: mapTrack(r),
      }));
    },
    [db],
  );

  const getSummary = useCallback(async () => {
    const result = await db.getFirstAsync<{
      total_plays: number;
      total_seconds: number;
      unique_tracks: number;
    }>(
      `SELECT COUNT(*) as total_plays,
              COALESCE(SUM(played_seconds), 0) as total_seconds,
              COUNT(DISTINCT track_id) as unique_tracks
       FROM play_history`,
    );
    return {
      totalPlays: result?.total_plays ?? 0,
      totalSeconds: result?.total_seconds ?? 0,
      uniqueTracks: result?.unique_tracks ?? 0,
    };
  }, [db]);

  return { recordPlay, getRecent, getSummary };
}

// ==========================================
// Radio Favorites
// ==========================================

export function useRadioFavorites() {
  const db = useSQLiteContext();
  const [favorites, setFavorites] = useState<RadioFavorite[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await db.getAllAsync<{
      id: string;
      station_uuid: string;
      name: string;
      url: string;
      url_resolved: string;
      homepage: string | null;
      favicon: string | null;
      country: string | null;
      country_code: string | null;
      language: string | null;
      codec: string | null;
      bitrate: number | null;
      tags: string | null;
      created_at: string;
    }>('SELECT * FROM radio_favorites ORDER BY created_at DESC');
    setFavorites(
      rows.map(r => ({
        id: r.id,
        stationUuid: r.station_uuid,
        name: r.name,
        url: r.url,
        urlResolved: r.url_resolved,
        homepage: r.homepage,
        favicon: r.favicon,
        country: r.country,
        countryCode: r.country_code,
        language: r.language,
        codec: r.codec,
        bitrate: r.bitrate,
        tags: r.tags,
        createdAt: r.created_at,
      })),
    );
    setLoading(false);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (station: Omit<RadioFavorite, 'id' | 'createdAt'>) => {
      const id = randomUUID();
      await db.runAsync(
        `INSERT OR IGNORE INTO radio_favorites
         (id, station_uuid, name, url, url_resolved, homepage, favicon, country, country_code, language, codec, bitrate, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, station.stationUuid, station.name, station.url, station.urlResolved,
         station.homepage, station.favicon, station.country, station.countryCode,
         station.language, station.codec, station.bitrate, station.tags],
      );
      await refresh();
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (stationUuid: string) => {
      await db.runAsync('DELETE FROM radio_favorites WHERE station_uuid = ?', [stationUuid]);
      await refresh();
    },
    [db, refresh],
  );

  const isFavorite = useCallback(
    async (stationUuid: string): Promise<boolean> => {
      const row = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM radio_favorites WHERE station_uuid = ?',
        [stationUuid],
      );
      return (row?.count ?? 0) > 0;
    },
    [db],
  );

  return { favorites, loading, refresh, add, remove, isFavorite };
}
