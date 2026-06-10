import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type {
  DbExportResult,
  DbImportResult,
  SmartPlaylist,
  SmartPlaylistDefinition,
  SmartPlaylistRule,
  SmartPlaylistMatchType,
} from '@shiranami/contracts';
import type {
  ListeningActivityPoint,
  ListeningHourlyActivityPoint,
  ListeningHistoryEntry,
  ListeningStatsSummary,
  WeeklyInsights,
} from '../types';

const C = IPC_CHANNELS.db;

export interface DbTracksApi {
  getAll: () => Promise<unknown[]>;
  add: (track: unknown) => Promise<unknown>;
  addMany: (tracks: unknown[]) => Promise<unknown[]>;
  remove: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  update: (id: string, data: unknown) => Promise<unknown>;
  updateMany: (updates: Array<{ id: string; data: unknown }>) => Promise<void>;
  toggleFavorite: (id: string) => Promise<unknown>;
  getFavorites: () => Promise<unknown[]>;
  incrementPlayCount: (id: string) => Promise<unknown>;
  exists: (filePath: string) => Promise<boolean>;
  existsMany: (filePaths: string[]) => Promise<string[]>;
  getIdByPath: (filePath: string) => Promise<string | null>;
}

export interface DbHistoryApi {
  recordPlay: (data: {
    trackId: string;
    playedSeconds: number;
    duration: number | null;
    source?: string;
  }) => Promise<unknown>;
  getRecent: (options?: {
    limit?: number;
    since?: string | null;
  }) => Promise<ListeningHistoryEntry[]>;
  getSummary: (options?: {
    since?: string | null;
    until?: string | null;
  }) => Promise<ListeningStatsSummary>;
  getActivity: (options?: { since?: string | null }) => Promise<ListeningActivityPoint[]>;
  getHourlyActivity: (options?: {
    since?: string | null;
  }) => Promise<ListeningHourlyActivityPoint[]>;
  getWeeklyInsights: (options?: { since?: string | null }) => Promise<WeeklyInsights>;
}

export interface DbFoldersApi {
  getAll: () => Promise<unknown[]>;
  add: (path: string) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  updateScanned: (id: string) => Promise<unknown>;
}

export interface DbPlaylistsApi {
  getAll: () => Promise<unknown[]>;
  get: (id: string) => Promise<unknown>;
  create: (data: { name: string; description?: string; coverArt?: string }) => Promise<unknown>;
  createWithTracks: (data: {
    name: string;
    description?: string;
    trackIds: string[];
  }) => Promise<unknown>;
  update: (
    id: string,
    data: { name?: string; description?: string; coverArt?: string }
  ) => Promise<unknown>;
  delete: (id: string) => Promise<void>;
  getTracks: (playlistId: string) => Promise<unknown[]>;
  addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
  removeTrack: (playlistId: string, trackId: string) => Promise<void>;
  getPlaylistsForTracks: (trackIds: string[]) => Promise<string[]>;
  reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
}

export interface DbSmartPlaylistsApi {
  getAll: () => Promise<SmartPlaylist[]>;
  get: (id: string) => Promise<SmartPlaylist | null>;
  create: (data: {
    name: string;
    description?: string;
    matchType: SmartPlaylistMatchType;
    rules: SmartPlaylistRule[];
  }) => Promise<SmartPlaylist>;
  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      matchType?: SmartPlaylistMatchType;
      rules?: SmartPlaylistRule[];
    }
  ) => Promise<SmartPlaylist | null>;
  delete: (id: string) => Promise<void>;
  /** Evaluate a saved smart playlist and return matching track rows. */
  getTracks: (id: string) => Promise<unknown[]>;
  /** Evaluate an unsaved rule definition (live editor preview). */
  preview: (definition: SmartPlaylistDefinition) => Promise<unknown[]>;
}

export interface DbBackupApi {
  export: () => Promise<DbExportResult>;
  import: () => Promise<DbImportResult>;
}

export interface DbApi {
  tracks: DbTracksApi;
  history: DbHistoryApi;
  folders: DbFoldersApi;
  playlists: DbPlaylistsApi;
  smartPlaylists: DbSmartPlaylistsApi;
  backup: DbBackupApi;
}

const tracksApi: DbTracksApi = {
  getAll: () => invoke(C.tracks.getAll),
  add: track => invoke(C.tracks.add, track),
  addMany: tracks => invoke(C.tracks.addMany, tracks),
  remove: id => invoke(C.tracks.remove, id),
  removeMany: ids => invoke(C.tracks.removeMany, ids),
  update: (id, data) => invoke(C.tracks.update, id, data),
  updateMany: updates => invoke(C.tracks.updateMany, updates),
  toggleFavorite: id => invoke(C.tracks.toggleFavorite, id),
  getFavorites: () => invoke(C.tracks.getFavorites),
  incrementPlayCount: id => invoke(C.tracks.incrementPlayCount, id),
  exists: filePath => invoke(C.tracks.exists, filePath),
  existsMany: filePaths => invoke(C.tracks.existsMany, filePaths) as Promise<string[]>,
  getIdByPath: filePath => invoke(C.tracks.getIdByPath, filePath) as Promise<string | null>,
};

const historyApi: DbHistoryApi = {
  recordPlay: data => invoke(C.history.recordPlay, data),
  getRecent: options => invoke(C.history.getRecent, options),
  getSummary: options => invoke(C.history.getSummary, options),
  getActivity: options => invoke(C.history.getActivity, options),
  getHourlyActivity: options => invoke(C.history.getHourlyActivity, options),
  getWeeklyInsights: options => invoke(C.history.getWeeklyInsights, options),
};

const foldersApi: DbFoldersApi = {
  getAll: () => invoke(C.folders.getAll),
  add: path => invoke(C.folders.add, path),
  remove: id => invoke(C.folders.remove, id),
  updateScanned: id => invoke(C.folders.updateScanned, id),
};

const playlistsApi: DbPlaylistsApi = {
  getAll: () => invoke(C.playlists.getAll),
  get: id => invoke(C.playlists.get, id),
  create: data => invoke(C.playlists.create, data),
  createWithTracks: data => invoke(C.playlists.createWithTracks, data),
  update: (id, data) => invoke(C.playlists.update, id, data),
  delete: id => invoke(C.playlists.delete, id),
  getTracks: playlistId => invoke(C.playlists.getTracks, playlistId),
  addTrack: (playlistId, trackId) => invoke(C.playlists.addTrack, { playlistId, trackId }),
  removeTrack: (playlistId, trackId) => invoke(C.playlists.removeTrack, { playlistId, trackId }),
  getPlaylistsForTracks: trackIds => invoke(C.playlists.getPlaylistsForTracks, trackIds),
  reorder: (playlistId, trackIds) => invoke(C.playlists.reorder, { playlistId, trackIds }),
};

const smartPlaylistsApi: DbSmartPlaylistsApi = {
  getAll: () => invoke(C.smartPlaylists.getAll),
  get: id => invoke(C.smartPlaylists.get, id),
  create: data => invoke(C.smartPlaylists.create, data),
  update: (id, data) => invoke(C.smartPlaylists.update, id, data),
  delete: id => invoke(C.smartPlaylists.delete, id),
  getTracks: id => invoke(C.smartPlaylists.getTracks, id),
  preview: definition => invoke(C.smartPlaylists.preview, definition),
};

const backupApi: DbBackupApi = {
  export: () => invoke(C.backup.export),
  import: () => invoke(C.backup.import),
};

export const dbApi: DbApi = {
  tracks: tracksApi,
  history: historyApi,
  folders: foldersApi,
  playlists: playlistsApi,
  smartPlaylists: smartPlaylistsApi,
  backup: backupApi,
};
