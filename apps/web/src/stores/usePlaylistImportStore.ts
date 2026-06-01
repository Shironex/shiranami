import { create } from 'zustand';
import type { SearchResult } from '@/types/electron';

export type PlaylistTrackStatus =
  | 'pending'
  | 'downloading'
  | 'converting'
  | 'done'
  | 'error'
  | 'skipped';

export interface PlaylistTrack {
  id: string;
  searchResult: SearchResult;
  status: PlaylistTrackStatus;
  progress: number;
  error?: string;
}

interface PlaylistImportState {
  url: string;
  tracks: PlaylistTrack[];
  /** Source playlist title surfaced by the provider (YouTube/Spotify), if any. */
  sourceTitle: string | null;
  /**
   * Whether to recreate a real Shiranami playlist (preserving source name +
   * order) from the successfully imported tracks. Defaults on when a source
   * title is available.
   */
  createPlaylist: boolean;
  isExtracting: boolean;
  extractProgress: { current: number; total: number; trackName: string } | null;
  isImporting: boolean;
  isCancelled: boolean;
  importingTrackIds: Set<string> | null;
  /**
   * The download-queue batch this import session owns, kept here (not in a
   * component-local ref) so the view's progress projection survives navigating
   * away to the Downloads view and back. `null` when no import is in flight.
   */
  activeBatchId: string | null;
}

interface PlaylistImportActions {
  setUrl: (url: string) => void;
  setTracks: (results: SearchResult[], sourceTitle?: string | null) => void;
  setCreatePlaylist: (value: boolean) => void;
  removeTrack: (id: string) => void;
  removeTracks: (ids: Set<string>) => void;
  updateTrackStatus: (
    id: string,
    status: PlaylistTrackStatus,
    progress?: number,
    error?: string
  ) => void;
  startExtracting: () => void;
  stopExtracting: () => void;
  setExtractProgress: (progress: { current: number; total: number; trackName: string }) => void;
  startImporting: (trackIds?: Set<string>, batchId?: string) => void;
  cancelImport: () => void;
  reset: () => void;
}

const INITIAL_STATE: PlaylistImportState = {
  url: '',
  tracks: [],
  sourceTitle: null,
  createPlaylist: false,
  isExtracting: false,
  extractProgress: null,
  isImporting: false,
  isCancelled: false,
  importingTrackIds: null,
  activeBatchId: null,
};

function createPlaylistTrackId(result: SearchResult, index: number): string {
  const identity = result.webpage_url || result.url || result.id || 'track';
  return `${index}:${identity}`;
}

export const usePlaylistImportStore = create<PlaylistImportState & PlaylistImportActions>(set => ({
  ...INITIAL_STATE,

  setUrl: url => set({ url }),

  setTracks: (results, sourceTitle = null) =>
    set({
      tracks: results.map((r, index) => ({
        id: createPlaylistTrackId(r, index),
        searchResult: r,
        status: 'pending' as const,
        progress: 0,
      })),
      sourceTitle: sourceTitle && sourceTitle.trim() ? sourceTitle.trim() : null,
      createPlaylist: Boolean(sourceTitle && sourceTitle.trim()),
      isExtracting: false,
      extractProgress: null,
    }),

  setCreatePlaylist: value => set({ createPlaylist: value }),

  removeTrack: id =>
    set(s => ({
      tracks: s.tracks.filter(t => t.id !== id),
    })),

  removeTracks: ids =>
    set(s => ({
      tracks: s.tracks.filter(t => !ids.has(t.id)),
    })),

  updateTrackStatus: (id, status, progress, error) =>
    set(s => ({
      tracks: s.tracks.map(t => {
        if (t.id !== id) return t;
        return {
          ...t,
          status,
          progress: progress ?? t.progress,
          error: error ?? t.error,
        };
      }),
    })),

  startExtracting: () => set({ isExtracting: true, extractProgress: null, isCancelled: false }),
  stopExtracting: () => set({ isExtracting: false }),
  setExtractProgress: progress => set({ extractProgress: progress }),
  startImporting: (trackIds, batchId) =>
    set({
      isImporting: true,
      isCancelled: false,
      importingTrackIds: trackIds ?? null,
      activeBatchId: batchId ?? null,
    }),
  cancelImport: () => set({ isCancelled: true, isImporting: false }),
  reset: () => set(INITIAL_STATE),
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof usePlaylistImportStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    usePlaylistImportStore.setState(data.store.getState());
  }
  data.store = usePlaylistImportStore;
  hot.accept();
}
