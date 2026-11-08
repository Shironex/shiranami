import type { SQLiteDatabase } from 'expo-sqlite';
import type { Station } from 'radio-browser-api';
import type { Track } from '@/stores/usePlayerStore';

/** The parts of a radio-browser station the app uses, also stored for favorites. */
export interface RadioStation {
  id: string;
  name: string;
  url: string;
  urlResolved: string;
  homepage: string | null;
  favicon: string | null;
  country: string | null;
  countryCode: string | null;
  codec: string | null;
  bitrate: number | null;
  tags: string[];
}

export function fromApi(station: Station): RadioStation {
  return {
    id: station.id,
    name: station.name.trim(),
    url: station.url,
    urlResolved: station.urlResolved || station.url,
    homepage: station.homepage || null,
    favicon: station.favicon || null,
    country: station.country || null,
    countryCode: station.countryCode || null,
    codec: station.codec || null,
    bitrate: station.bitrate || null,
    tags: station.tags ?? [],
  };
}

/** "Netherlands · AAC 192 kbps". */
export function stationMeta(station: RadioStation): string {
  const format = [station.codec, station.bitrate ? `${station.bitrate} kbps` : null]
    .filter(Boolean)
    .join(' ');
  return [station.country, format].filter(Boolean).join(' · ');
}

export function stationTrack(station: RadioStation): Track {
  return {
    id: `radio-${station.id}`,
    title: station.name,
    artist: station.country || 'Internet radio',
    album: 'Radio',
    duration: 0,
    filePath: station.urlResolved,
    isLive: true,
  };
}

interface FavoriteRow {
  station_uuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string | null;
  favicon: string | null;
  country: string | null;
  country_code: string | null;
  codec: string | null;
  bitrate: number | null;
  tags: string | null;
}

/** Saved stations, newest first. Stored whole, so they list without the network. */
export async function loadFavoriteStations(db: SQLiteDatabase): Promise<RadioStation[]> {
  const rows = await db.getAllAsync<FavoriteRow>(
    'SELECT * FROM radio_favorites ORDER BY created_at DESC'
  );
  return rows.map(row => ({
    id: row.station_uuid,
    name: row.name,
    url: row.url,
    urlResolved: row.url_resolved,
    homepage: row.homepage,
    favicon: row.favicon,
    country: row.country,
    countryCode: row.country_code,
    codec: row.codec,
    bitrate: row.bitrate,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
  }));
}

export async function saveFavoriteStation(db: SQLiteDatabase, station: RadioStation) {
  await db.runAsync(
    `INSERT OR IGNORE INTO radio_favorites
     (id, station_uuid, name, url, url_resolved, homepage, favicon, country, country_code, codec, bitrate, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `rf-${station.id}`,
      station.id,
      station.name,
      station.url,
      station.urlResolved,
      station.homepage,
      station.favicon,
      station.country,
      station.countryCode,
      station.codec,
      station.bitrate,
      station.tags.join(','),
    ]
  );
}

export async function deleteFavoriteStation(db: SQLiteDatabase, stationId: string) {
  await db.runAsync('DELETE FROM radio_favorites WHERE station_uuid = ?', [stationId]);
}
