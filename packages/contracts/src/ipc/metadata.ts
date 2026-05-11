// Wire types for the metadata-enrich IPC surface.
//
// These were previously duplicated three ways — the main-process handler
// (apps/desktop/src/main/ipc/metadata-enrich.ts), the preload bridge
// (apps/desktop/src/main/preload/api/metadata.ts), and the renderer store
// (apps/web/src/stores/useMetadataEnrichStore.ts). They now live here so the
// shape is defined once and imported everywhere.

/** Where a metadata match came from. `'none'` means no match was found. */
export type MetadataLookupSource = 'itunes' | 'youtube' | 'none';

/** Input track passed to the bulk / preview enrich IPC calls. */
export interface EnrichTrackInput {
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

/** The fields a lookup proposes to change on a track. */
export type EnrichUpdatedFields = Partial<{
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  trackNumber: number;
  albumArt: string;
}>;

/** Result of enriching (or previewing the enrichment of) a single track. */
export interface EnrichTrackResult {
  id: string;
  success: boolean;
  updatedFields: EnrichUpdatedFields;
  /** Source of the match (`'itunes'`, `'youtube'`, `'none'`, or `'preview'`). */
  source: string;
  /**
   * Match confidence in the 0-1 range, when a match was found. Absent for
   * `source: 'none'` (and for the synthetic `'preview'` apply-results path).
   */
  confidence?: number;
  error?: string;
}

/** Per-track progress event streamed during a bulk enrich run. */
export interface EnrichProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
  /** Match confidence (0-1), populated on the `done` event when a match was found. */
  confidence?: number;
  /** Match source, populated on the `done` event when a match was found. */
  source?: string;
}

/** Result of the standalone `metadata:lookup` IPC call. */
export interface MetadataLookupResult {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  trackNumber?: number;
  coverImageUrl?: string;
  source: MetadataLookupSource;
  confidence: number;
}
