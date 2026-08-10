import { IPC_CHANNELS, type RadioApi, type RadioNowPlaying } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { radioNowPlaying } from '../narrowers';

const C = IPC_CHANNELS.radio;

export const radioApi: RadioApi = {
  favorites: {
    getAll: () => commands.radioFavoritesGetAll(),
    add: station => commands.radioFavoritesAdd(station),
    remove: async stationUuid => {
      await commands.radioFavoritesRemove(stationUuid);
    },
    isFavorite: stationUuid => commands.radioFavoritesIsFavorite(stationUuid),
  },
  onNowPlaying: callback =>
    subscribeChannel<RadioNowPlaying>(
      C.nowPlaying,
      events.radioNowPlaying,
      radioNowPlaying,
      callback
    ),
  log: {
    record: (stationUuid, playing) => commands.radioLogRecord(stationUuid, playing),
    // The generated callable takes the limit positionally and nullably, where
    // the contract leaves it optional — an absent limit is the command's own
    // default page, not "no rows".
    get: (stationUuid, limit) => commands.radioLogGet(stationUuid, limit ?? null),
  },
};
