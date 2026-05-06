import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.metadata;

interface EnrichInputTrack {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  genre: string;
  year: number | null;
  trackNumber: number | null;
}

interface EnrichResult {
  id: string;
  success: boolean;
  updatedFields: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
    year: number;
    trackNumber: number;
    albumArt: string;
  }>;
  source: string;
  error?: string;
}

interface LookupResult {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  coverImageUrl?: string;
  source: 'itunes' | 'youtube' | 'none';
  confidence: number;
}

export interface MetadataApi {
  lookup: (title: string, artist: string) => Promise<LookupResult>;
  enrichTracks: (
    tracks: EnrichInputTrack[],
    options: { writeToFile: boolean; onlyMissing: boolean }
  ) => Promise<EnrichResult[]>;
  /**
   * Look-up-only single-track enrichment. Returns the would-be `updatedFields`
   * (and a cached cover URL when one was downloaded) WITHOUT writing tags or
   * mutating the DB. The renderer is responsible for the apply step. Rejects
   * with code `metadata.enrich_busy` when a bulk run holds the abort slot.
   */
  previewEnrich: (
    track: EnrichInputTrack,
    options: { onlyMissing: boolean }
  ) => Promise<EnrichResult>;
  cancelEnrichment: () => Promise<void>;
  onEnrichProgress: (
    callback: (data: {
      current: number;
      total: number;
      trackName: string;
      status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
    }) => void
  ) => () => void;
}

export const metadataApi: MetadataApi = {
  lookup: (title, artist) => ipcRenderer.invoke(C.lookup, title, artist),
  enrichTracks: (tracks, options) => ipcRenderer.invoke(C.enrichTracks, tracks, options),
  previewEnrich: (track, options) => ipcRenderer.invoke(C.enrichPreview, track, options),
  cancelEnrichment: () => ipcRenderer.invoke(C.enrichCancel),
  onEnrichProgress: createIpcListener<{
    current: number;
    total: number;
    trackName: string;
    status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
  }>(C.enrichProgress),
};
