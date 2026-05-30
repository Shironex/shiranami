import { create } from 'zustand';

export type AppView =
  | 'overview'
  | 'library'
  | 'playlists'
  | 'favorites'
  | 'history'
  | 'mixes'
  | 'search'
  | 'radio'
  | 'settings'
  | 'import-playlist'
  | 'smart-playlists'
  | 'now-playing';
export type RightPanel = 'lyrics' | 'queue' | null;

interface ViewState {
  activeView: AppView;
  previousView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
  /** Currently open smart playlist (its dynamic track view), or null for the list. */
  selectedSmartPlaylistId: string | null;
  /**
   * Composite album identity (`albumArtist   album`, see `albumKeyOf`), NOT a
   * bare album title — so identically-named albums by different artists are
   * addressable separately.
   */
  selectedAlbumKey: string | null;
  albumGridScrollTop: number;
}

interface ViewActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  enterNowPlaying: () => void;
  exitNowPlaying: () => void;
  selectPlaylist: (id: string | null) => void;
  selectSmartPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
  selectAlbum: (key: string | null) => void;
  setAlbumGridScrollTop: (scrollTop: number) => void;
}

export const useViewStore = create<ViewState & ViewActions>()((set, get) => ({
  activeView: 'library',
  previousView: 'library',
  rightPanel: null,
  selectedPlaylistId: null,
  selectedSmartPlaylistId: null,
  selectedAlbumKey: null,
  albumGridScrollTop: 0,

  navigateTo: (view, playlistId) =>
    set({
      activeView: view,
      selectedPlaylistId: view === 'playlists' ? (playlistId ?? null) : null,
      // Leaving the smart-playlists section resets its open detail.
      selectedSmartPlaylistId: view === 'smart-playlists' ? get().selectedSmartPlaylistId : null,
    }),
  enterNowPlaying: () => {
    const current = get().activeView;
    if (current === 'now-playing') return;
    set({ previousView: current, activeView: 'now-playing' });
  },
  exitNowPlaying: () => {
    const prev = get().previousView;
    set({ activeView: prev });
  },
  selectPlaylist: id => set({ selectedPlaylistId: id }),
  selectSmartPlaylist: id => set({ selectedSmartPlaylistId: id }),
  setRightPanel: panel => set({ rightPanel: panel }),
  toggleRightPanel: panel => {
    const current = get().rightPanel;
    set({ rightPanel: current === panel ? null : panel });
  },
  selectAlbum: key => set({ selectedAlbumKey: key }),
  setAlbumGridScrollTop: scrollTop => set({ albumGridScrollTop: scrollTop }),
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof useViewStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useViewStore.setState(data.store.getState());
  }
  data.store = useViewStore;
  hot.accept();
}
