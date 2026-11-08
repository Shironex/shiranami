import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  type Playlist,
} from '@/lib/playlists';

interface PlaylistState {
  playlists: Playlist[];
  loaded: boolean;
  /** Songs removed from the library but not yet deleted; hidden from every playlist. */
  hiddenTrackIds: string[];
}

/** Every action writes SQLite first, then reloads, so the list mirrors the DB. */
interface PlaylistActions {
  load: (db: SQLiteDatabase) => Promise<void>;
  /** Hides songs from the playlists (an empty list shows them again). */
  setHidden: (trackIds: string[]) => void;
  create: (db: SQLiteDatabase, name: string) => Promise<string>;
  rename: (db: SQLiteDatabase, id: string, name: string) => Promise<void>;
  remove: (db: SQLiteDatabase, id: string) => Promise<void>;
  addTrack: (db: SQLiteDatabase, playlistId: string, trackId: string) => Promise<void>;
  removeTrack: (db: SQLiteDatabase, playlistId: string, trackId: string) => Promise<void>;
}

function withoutHidden(playlists: Playlist[], hidden: string[]): Playlist[] {
  if (hidden.length === 0) return playlists;
  const ids = new Set(hidden);
  return playlists.map(p => ({ ...p, trackIds: p.trackIds.filter(id => !ids.has(id)) }));
}

export const usePlaylistStore = create<PlaylistState & PlaylistActions>((set, get) => ({
  playlists: [],
  loaded: false,
  hiddenTrackIds: [],

  load: async db => {
    const playlists = await loadPlaylists(db);
    set({ playlists: withoutHidden(playlists, get().hiddenTrackIds), loaded: true });
  },
  setHidden: hiddenTrackIds => {
    set(s => ({
      hiddenTrackIds,
      playlists: hiddenTrackIds.length ? withoutHidden(s.playlists, hiddenTrackIds) : s.playlists,
    }));
  },
  create: async (db, name) => {
    const id = await createPlaylist(db, name);
    await get().load(db);
    return id;
  },
  rename: async (db, id, name) => {
    await renamePlaylist(db, id, name);
    await get().load(db);
  },
  remove: async (db, id) => {
    await deletePlaylist(db, id);
    await get().load(db);
  },
  addTrack: async (db, playlistId, trackId) => {
    await addToPlaylist(db, playlistId, trackId);
    await get().load(db);
  },
  removeTrack: async (db, playlistId, trackId) => {
    await removeFromPlaylist(db, playlistId, trackId);
    await get().load(db);
  },
}));
