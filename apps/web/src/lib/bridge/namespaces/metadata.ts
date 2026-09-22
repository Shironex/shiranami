import {
  IPC_CHANNELS,
  type EnrichProgress,
  type EnrichTrackResult,
  type MetadataApi,
  type MetadataLookupResult,
  type WriteTagsResult,
} from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { enrichProgress } from '../narrowers';
import { asContract } from '../wire';

const C = IPC_CHANNELS.metadata;

export const metadataApi: MetadataApi = {
  lookup: (title, artist) =>
    asContract<MetadataLookupResult>(commands.metadataLookup(title, artist)),
  enrichTracks: (tracks, options) =>
    asContract<EnrichTrackResult[]>(commands.metadataEnrichTracks(tracks, options)),
  previewEnrich: (track, options) =>
    asContract<EnrichTrackResult>(commands.metadataEnrichPreview(track, options)),
  cancelEnrichment: async () => {
    await commands.metadataEnrichCancel();
  },
  onEnrichProgress: callback =>
    subscribeChannel<EnrichProgress>(
      C.enrichProgress,
      events.metadataEnrichProgress,
      enrichProgress,
      callback
    ),
  writeTags: input => asContract<WriteTagsResult>(commands.metadataWriteTags(input)),
};
