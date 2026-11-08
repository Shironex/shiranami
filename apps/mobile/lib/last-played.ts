import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import type { RadioStation } from '@/lib/radio';

/** The last library track that played, and how far into it. */
export interface LastTrack {
  id: string;
  /** Seconds. */
  position: number;
}

export interface LastPlayed {
  track: LastTrack | null;
  station: RadioStation | null;
}

const TRACK_ID = 'lastTrackId';
const TRACK_POSITION = 'lastTrackPosition';
const STATION = 'lastStation';

function put(db: SQLiteDatabase, key: string, value: string) {
  return db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

function parseStation(raw: string | undefined): RadioStation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RadioStation>;
    if (typeof value.id === 'string' && typeof value.name === 'string' && value.urlResolved) {
      return value as RadioStation;
    }
  } catch {
    // A damaged value counts as nothing played yet.
  }
  return null;
}

export async function loadLastPlayed(db: SQLiteDatabase): Promise<LastPlayed> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings WHERE key IN (?, ?, ?)',
    [TRACK_ID, TRACK_POSITION, STATION]
  );
  const raw = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const position = Number(raw[TRACK_POSITION]);
  return {
    track: raw[TRACK_ID]
      ? { id: raw[TRACK_ID], position: Number.isFinite(position) && position > 0 ? position : 0 }
      : null,
    station: parseStation(raw[STATION]),
  };
}

export async function saveLastTrack(db: SQLiteDatabase, track: LastTrack): Promise<void> {
  await put(db, TRACK_ID, track.id);
  await put(db, TRACK_POSITION, String(Math.floor(track.position)));
}

export async function saveLastStation(db: SQLiteDatabase, station: RadioStation): Promise<void> {
  await put(db, STATION, JSON.stringify(station));
}

interface LastPlayedState extends LastPlayed {
  loaded: boolean;
  set: (next: Partial<LastPlayed>) => void;
  hydrate: (next: LastPlayed) => void;
}

/** In-memory copy of what is saved, so the launcher shortcuts follow it. */
export const useLastPlayedStore = create<LastPlayedState>(set => ({
  track: null,
  station: null,
  loaded: false,
  set: next => set(next),
  hydrate: next => set({ ...next, loaded: true }),
}));
