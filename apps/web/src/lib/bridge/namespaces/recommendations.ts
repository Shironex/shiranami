import type {
  RecommendationShelves,
  RecommendationsApi,
  SmartMixResult,
} from '@shiranami/contracts';
import { commands } from '../commands';
import { asContract } from '../wire';

export const recommendationsApi: RecommendationsApi = {
  get: () => asContract<RecommendationShelves>(commands.recommendationsGet()),
  refresh: () => asContract<RecommendationShelves>(commands.recommendationsRefresh()),
  similar: seedTrackId => commands.recommendationsSimilar(seedTrackId),
  notInterested: async trackId => {
    await commands.recommendationsNotInterested(trackId);
  },
  undoNotInterested: async trackId => {
    await commands.recommendationsUndoNotInterested(trackId);
  },
  smartMixes: signals =>
    asContract<SmartMixResult[] | null>(commands.recommendationsSmartMixes(signals)),
};
