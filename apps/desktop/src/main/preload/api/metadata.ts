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
  cancelEnrichment: () => ipcRenderer.invoke(C.enrichCancel),
  onEnrichProgress: createIpcListener<{
    current: number;
    total: number;
    trackName: string;
    status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
  }>(C.enrichProgress),
};
