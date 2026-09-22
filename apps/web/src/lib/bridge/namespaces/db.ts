import type {
  DbApi,
  DbFoldersApi,
  DbHistoryApi,
  DbPlaylistsApi,
  DbSmartPlaylistsApi,
  DbTracksApi,
  Playlist,
  SmartPlaylist,
  Track,
  WatchedFolder,
} from '@shiranami/contracts';
import { commands } from '../commands';
import { asContract, orUndefined } from '../wire';
import { dbBackupApi } from './db-backup';

const tracksApi: DbTracksApi = {
  getAll: () => asContract<Track[]>(commands.dbTracksGetAll()),
  add: track => orUndefined(asContract<Track | null>(commands.dbTracksAdd(track))),
  addMany: tracks => asContract<Track[]>(commands.dbTracksAddMany(tracks)),
  remove: async id => {
    await commands.dbTracksRemove(id);
  },
  removeMany: async ids => {
    await commands.dbTracksRemoveMany(ids);
  },
  update: (id, data) => orUndefined(asContract<Track | null>(commands.dbTracksUpdate(id, data))),
  updateMany: async updates => {
    await commands.dbTracksUpdateMany(updates);
  },
  toggleFavorite: id => orUndefined(asContract<Track | null>(commands.dbTracksToggleFavorite(id))),
  getFavorites: () => asContract<Track[]>(commands.dbTracksGetFavorites()),
  incrementPlayCount: id =>
    orUndefined(asContract<Track | null>(commands.dbTracksIncrementPlayCount(id))),
  exists: filePath => commands.dbTracksExists(filePath),
  existsMany: filePaths => commands.dbTracksExistsMany(filePaths),
  getIdByPath: filePath => commands.dbTracksGetIdByPath(filePath),
  search: (query, limit) => asContract<Track[]>(commands.dbTracksSearch(query, limit ?? null)),
};

const historyApi: DbHistoryApi = {
  recordPlay: data => commands.dbHistoryRecordPlay(data),
  // Every read here takes an optional options bag that the generated binding
  // spells nullable; `?? null` is the difference between "no filter" and a
  // missing field serde would refuse.
  getRecent: options => commands.dbHistoryGetRecent(options ?? null),
  getSummary: options => commands.dbHistoryGetSummary(options ?? null),
  getActivity: options => commands.dbHistoryGetActivity(options ?? null),
  getHourlyActivity: options => commands.dbHistoryGetHourlyActivity(options ?? null),
  getWeeklyInsights: options => commands.dbHistoryGetWeeklyInsights(options ?? null),
};

const foldersApi: DbFoldersApi = {
  getAll: () => asContract<WatchedFolder[]>(commands.dbFoldersGetAll()),
  add: path => orUndefined(asContract<WatchedFolder | null>(commands.dbFoldersAdd(path))),
  remove: async id => {
    await commands.dbFoldersRemove(id);
  },
  updateScanned: id =>
    orUndefined(asContract<WatchedFolder | null>(commands.dbFoldersUpdateScanned(id))),
};

const playlistsApi: DbPlaylistsApi = {
  getAll: () => asContract<Playlist[]>(commands.dbPlaylistsGetAll()),
  get: id => orUndefined(asContract<Playlist | null>(commands.dbPlaylistsGet(id))),
  create: data => orUndefined(asContract<Playlist | null>(commands.dbPlaylistsCreate(data))),
  createWithTracks: data =>
    orUndefined(asContract<Playlist | null>(commands.dbPlaylistsCreateWithTracks(data))),
  update: (id, data) =>
    orUndefined(asContract<Playlist | null>(commands.dbPlaylistsUpdate(id, data))),
  delete: async id => {
    await commands.dbPlaylistsDelete(id);
  },
  getTracks: playlistId => asContract<Track[]>(commands.dbPlaylistsGetTracks(playlistId)),
  // The membership channels take two positional arguments at the API and one
  // object on the wire, exactly as v1's preload packed them.
  addTrack: (playlistId, trackId) => commands.dbPlaylistsAddTrack({ playlistId, trackId }),
  addTracks: async (playlistId, trackIds) => {
    await commands.dbPlaylistsAddTracks({ playlistId, trackIds });
  },
  removeTrack: async (playlistId, trackId) => {
    await commands.dbPlaylistsRemoveTrack({ playlistId, trackId });
  },
  removeTracks: async (playlistId, trackIds) => {
    await commands.dbPlaylistsRemoveTracks({ playlistId, trackIds });
  },
  getPlaylistsForTracks: trackIds => commands.dbPlaylistsGetPlaylistsForTracks(trackIds),
  reorder: async (playlistId, trackIds) => {
    await commands.dbPlaylistsReorder({ playlistId, trackIds });
  },
};

const smartPlaylistsApi: DbSmartPlaylistsApi = {
  getAll: () => asContract<SmartPlaylist[]>(commands.dbSmartPlaylistsGetAll()),
  get: id => asContract<SmartPlaylist | null>(commands.dbSmartPlaylistsGet(id)),
  create: data => asContract<SmartPlaylist>(commands.dbSmartPlaylistsCreate(data)),
  update: (id, data) => asContract<SmartPlaylist | null>(commands.dbSmartPlaylistsUpdate(id, data)),
  delete: async id => {
    await commands.dbSmartPlaylistsDelete(id);
  },
  getTracks: id => asContract<Track[]>(commands.dbSmartPlaylistsGetTracks(id)),
  preview: definition => asContract<Track[]>(commands.dbSmartPlaylistsPreview(definition)),
};

export const dbApi: DbApi = {
  tracks: tracksApi,
  history: historyApi,
  folders: foldersApi,
  playlists: playlistsApi,
  smartPlaylists: smartPlaylistsApi,
  backup: dbBackupApi,
};
