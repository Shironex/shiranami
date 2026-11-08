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
}

/** Every action writes SQLite first, then reloads, so the list mirrors the DB. */
interface PlaylistActions {
  load: (db: SQLiteDatabase) => Promise<void>;
  create: (db: SQLiteDatabase, name: string) => Promise<string>;
  rename: (db: SQLiteDatabase, id: string, name: string) => Promise<void>;
  remove: (db: SQLiteDatabase, id: string) => Promise<void>;
  addTrack: (db: SQLiteDatabase, playlistId: string, trackId: string) => Promise<void>;
  removeTrack: (db: SQLiteDatabase, playlistId: string, trackId: string) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState & PlaylistActions>((set, get) => ({
  playlists: [],
  loaded: false,

  load: async db => {
    set({ playlists: await loadPlaylists(db), loaded: true });
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
