import { ipcRenderer } from 'electron';
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
  updateMany: (updates: Array<{ id: string; data: unknown }>) => Promise<unknown[]>;
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
  getAll: () => ipcRenderer.invoke(C.tracks.getAll),
  add: track => ipcRenderer.invoke(C.tracks.add, track),
  addMany: tracks => ipcRenderer.invoke(C.tracks.addMany, tracks),
  remove: id => ipcRenderer.invoke(C.tracks.remove, id),
  removeMany: ids => ipcRenderer.invoke(C.tracks.removeMany, ids),
  update: (id, data) => ipcRenderer.invoke(C.tracks.update, id, data),
  updateMany: updates => ipcRenderer.invoke(C.tracks.updateMany, updates),
  toggleFavorite: id => ipcRenderer.invoke(C.tracks.toggleFavorite, id),
  getFavorites: () => ipcRenderer.invoke(C.tracks.getFavorites),
  incrementPlayCount: id => ipcRenderer.invoke(C.tracks.incrementPlayCount, id),
  exists: filePath => ipcRenderer.invoke(C.tracks.exists, filePath),
  existsMany: filePaths => ipcRenderer.invoke(C.tracks.existsMany, filePaths) as Promise<string[]>,
  getIdByPath: filePath =>
    ipcRenderer.invoke(C.tracks.getIdByPath, filePath) as Promise<string | null>,
};

const historyApi: DbHistoryApi = {
  recordPlay: data => ipcRenderer.invoke(C.history.recordPlay, data),
  getRecent: options => ipcRenderer.invoke(C.history.getRecent, options),
  getSummary: options => ipcRenderer.invoke(C.history.getSummary, options),
  getActivity: options => ipcRenderer.invoke(C.history.getActivity, options),
  getHourlyActivity: options => ipcRenderer.invoke(C.history.getHourlyActivity, options),
  getWeeklyInsights: options => ipcRenderer.invoke(C.history.getWeeklyInsights, options),
};

const foldersApi: DbFoldersApi = {
  getAll: () => ipcRenderer.invoke(C.folders.getAll),
  add: path => ipcRenderer.invoke(C.folders.add, path),
  remove: id => ipcRenderer.invoke(C.folders.remove, id),
  updateScanned: id => ipcRenderer.invoke(C.folders.updateScanned, id),
};

const playlistsApi: DbPlaylistsApi = {
  getAll: () => ipcRenderer.invoke(C.playlists.getAll),
  get: id => ipcRenderer.invoke(C.playlists.get, id),
  create: data => ipcRenderer.invoke(C.playlists.create, data),
  createWithTracks: data => ipcRenderer.invoke(C.playlists.createWithTracks, data),
  update: (id, data) => ipcRenderer.invoke(C.playlists.update, id, data),
  delete: id => ipcRenderer.invoke(C.playlists.delete, id),
  getTracks: playlistId => ipcRenderer.invoke(C.playlists.getTracks, playlistId),
  addTrack: (playlistId, trackId) =>
    ipcRenderer.invoke(C.playlists.addTrack, { playlistId, trackId }),
  removeTrack: (playlistId, trackId) =>
    ipcRenderer.invoke(C.playlists.removeTrack, { playlistId, trackId }),
  getPlaylistsForTracks: trackIds =>
    ipcRenderer.invoke(C.playlists.getPlaylistsForTracks, trackIds),
  reorder: (playlistId, trackIds) =>
    ipcRenderer.invoke(C.playlists.reorder, { playlistId, trackIds }),
};

const smartPlaylistsApi: DbSmartPlaylistsApi = {
  getAll: () => ipcRenderer.invoke(C.smartPlaylists.getAll),
  get: id => ipcRenderer.invoke(C.smartPlaylists.get, id),
  create: data => ipcRenderer.invoke(C.smartPlaylists.create, data),
  update: (id, data) => ipcRenderer.invoke(C.smartPlaylists.update, id, data),
  delete: id => ipcRenderer.invoke(C.smartPlaylists.delete, id),
  getTracks: id => ipcRenderer.invoke(C.smartPlaylists.getTracks, id),
  preview: definition => ipcRenderer.invoke(C.smartPlaylists.preview, definition),
};

const backupApi: DbBackupApi = {
  export: () => ipcRenderer.invoke(C.backup.export),
  import: () => ipcRenderer.invoke(C.backup.import),
};

export const dbApi: DbApi = {
  tracks: tracksApi,
  history: historyApi,
  folders: foldersApi,
  playlists: playlistsApi,
  smartPlaylists: smartPlaylistsApi,
  backup: backupApi,
};
