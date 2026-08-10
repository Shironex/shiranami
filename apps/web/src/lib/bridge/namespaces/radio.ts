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
};
