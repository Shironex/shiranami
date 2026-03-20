import { create } from 'zustand';
import type { SearchResult } from '@/types/electron';

export type PlaylistTrackStatus = 'pending' | 'downloading' | 'converting' | 'done' | 'error' | 'skipped';

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
  isExtracting: boolean;
  extractProgress: { current: number; total: number; trackName: string } | null;
  isImporting: boolean;
  isCancelled: boolean;
}

interface PlaylistImportActions {
  setUrl: (url: string) => void;
  setTracks: (results: SearchResult[]) => void;
  removeTrack: (id: string) => void;
  updateTrackStatus: (
    id: string,
    status: PlaylistTrackStatus,
    progress?: number,
    error?: string
  ) => void;
  startExtracting: () => void;
  stopExtracting: () => void;
  setExtractProgress: (progress: { current: number; total: number; trackName: string }) => void;
  startImporting: () => void;
  cancelImport: () => void;
  reset: () => void;
}

const INITIAL_STATE: PlaylistImportState = {
  url: '',
  tracks: [],
  isExtracting: false,
  extractProgress: null,
  isImporting: false,
  isCancelled: false,
};

function createPlaylistTrackId(result: SearchResult, index: number): string {
  const identity = result.webpage_url || result.url || result.id || 'track';
  return `${index}:${identity}`;
}

export const usePlaylistImportStore = create<PlaylistImportState & PlaylistImportActions>(
  (set) => ({
    ...INITIAL_STATE,

    setUrl: (url) => set({ url }),

    setTracks: (results) =>
      set({
        tracks: results.map((r, index) => ({
          id: createPlaylistTrackId(r, index),
          searchResult: r,
          status: 'pending' as const,
          progress: 0,
        })),
        isExtracting: false,
        extractProgress: null,
      }),

    removeTrack: (id) =>
      set((s) => ({
        tracks: s.tracks.filter((t) => t.id !== id),
      })),

    updateTrackStatus: (id, status, progress, error) =>
      set((s) => ({
        tracks: s.tracks.map((t) => {
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
    setExtractProgress: (progress) => set({ extractProgress: progress }),
    startImporting: () => set({ isImporting: true, isCancelled: false }),
    cancelImport: () => set({ isCancelled: true, isImporting: false }),
    reset: () => set(INITIAL_STATE),
  })
);

if (import.meta.hot) {
  if (import.meta.hot.data.store) {
    usePlaylistImportStore.setState(import.meta.hot.data.store.getState());
  }
  import.meta.hot.data.store = usePlaylistImportStore;
  import.meta.hot.accept();
}
