import { ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type EnrichTrackInput,
  type EnrichTrackResult,
  type EnrichProgress,
  type MetadataLookupResult,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.metadata;

export interface MetadataApi {
  lookup: (title: string, artist: string) => Promise<MetadataLookupResult>;
  enrichTracks: (
    tracks: EnrichTrackInput[],
    options: { writeToFile: boolean; onlyMissing: boolean }
  ) => Promise<EnrichTrackResult[]>;
  /**
   * Look-up-only single-track enrichment. Returns the would-be `updatedFields`
   * (and a cached cover URL when one was downloaded) WITHOUT writing tags or
   * mutating the DB. The renderer is responsible for the apply step. Rejects
   * with code `metadata.enrich_busy` when a bulk run holds the abort slot.
   */
  previewEnrich: (
    track: EnrichTrackInput,
    options: { onlyMissing: boolean }
  ) => Promise<EnrichTrackResult>;
  cancelEnrichment: () => Promise<void>;
  onEnrichProgress: (callback: (data: EnrichProgress) => void) => () => void;
}

export const metadataApi: MetadataApi = {
  lookup: (title, artist) => ipcRenderer.invoke(C.lookup, title, artist),
  enrichTracks: (tracks, options) => ipcRenderer.invoke(C.enrichTracks, tracks, options),
  previewEnrich: (track, options) => ipcRenderer.invoke(C.enrichPreview, track, options),
  cancelEnrichment: () => ipcRenderer.invoke(C.enrichCancel),
  onEnrichProgress: createIpcListener<EnrichProgress>(C.enrichProgress),
};
