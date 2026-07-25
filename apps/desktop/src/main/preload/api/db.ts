import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type {
  DbApi,
  DbBackupApi,
  DbFoldersApi,
  DbHistoryApi,
  DbPlaylistsApi,
  DbSmartPlaylistsApi,
  DbTracksApi,
} from '@shiranami/contracts';

const C = IPC_CHANNELS.db;

export type {
  DbApi,
  DbBackupApi,
  DbFoldersApi,
  DbHistoryApi,
  DbPlaylistsApi,
  DbSmartPlaylistsApi,
  DbTracksApi,
};

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
  addTracks: (playlistId, trackIds) => invoke(C.playlists.addTracks, { playlistId, trackIds }),
  removeTrack: (playlistId, trackId) => invoke(C.playlists.removeTrack, { playlistId, trackId }),
  removeTracks: (playlistId, trackIds) =>
    invoke(C.playlists.removeTracks, { playlistId, trackIds }),
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
