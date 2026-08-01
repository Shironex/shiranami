import type { RadioApi } from '@shiranami/contracts';
import { commands } from '../commands';

export const radioApi: RadioApi = {
  favorites: {
    getAll: () => commands.radioFavoritesGetAll(),
    add: station => commands.radioFavoritesAdd(station),
    remove: async stationUuid => {
      await commands.radioFavoritesRemove(stationUuid);
    },
    isFavorite: stationUuid => commands.radioFavoritesIsFavorite(stationUuid),
  },
};
