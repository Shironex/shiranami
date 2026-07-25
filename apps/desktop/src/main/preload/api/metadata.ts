import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type EnrichProgress, type MetadataApi } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.metadata;

export type { MetadataApi };

export const metadataApi: MetadataApi = {
  lookup: (title, artist) => invoke(C.lookup, title, artist),
  enrichTracks: (tracks, options) => invoke(C.enrichTracks, tracks, options),
  previewEnrich: (track, options) => invoke(C.enrichPreview, track, options),
  cancelEnrichment: () => invoke(C.enrichCancel),
  onEnrichProgress: createIpcListener<EnrichProgress>(C.enrichProgress),
  writeTags: input => invoke(C.writeTags, input),
};
