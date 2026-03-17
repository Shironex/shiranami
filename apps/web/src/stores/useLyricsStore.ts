import { create } from 'zustand';

export interface LyricLine {
  time: number;
  text: string;
}

interface LyricsState {
  synced: LyricLine[] | null;
  plain: string | null;
  source: string | null;
  isLoading: boolean;
  error: string | null;
  currentTrackId: string | null; // track which lyrics belong to
}

interface LyricsActions {
  fetchLyrics: (trackId: string, title: string, artist: string, album?: string, duration?: number) => Promise<void>;
  clear: () => void;
}

export const useLyricsStore = create<LyricsState & LyricsActions>((set, get) => ({
  synced: null,
  plain: null,
  source: null,
  isLoading: false,
  error: null,
  currentTrackId: null,

  fetchLyrics: async (trackId, title, artist, album, duration) => {
    // Don't refetch for same track
    if (get().currentTrackId === trackId && (get().synced || get().plain)) return;

    set({ isLoading: true, error: null, currentTrackId: trackId, synced: null, plain: null });

    try {
      if (!window.electronAPI?.lyrics) {
        set({ isLoading: false });
        return;
      }

      const result = await window.electronAPI.lyrics.fetch(title, artist, album, duration);

      // Check if track changed while we were fetching
      if (get().currentTrackId !== trackId) return;

      set({
        synced: result.synced,
        plain: result.plain,
        source: result.source,
        isLoading: false,
      });
    } catch (error) {
      if (get().currentTrackId !== trackId) return;
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch lyrics',
        isLoading: false,
      });
    }
  },

  clear: () => set({
    synced: null,
    plain: null,
    source: null,
    isLoading: false,
    error: null,
    currentTrackId: null,
  }),
}));
