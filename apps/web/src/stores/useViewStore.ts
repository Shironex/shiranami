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
  | 'now-playing';
export type RightPanel = 'lyrics' | 'queue' | null;

interface ViewState {
  activeView: AppView;
  previousView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
  selectedAlbumName: string | null;
  albumGridScrollTop: number;
}

interface ViewActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  enterNowPlaying: () => void;
  exitNowPlaying: () => void;
  selectPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
  selectAlbum: (name: string | null) => void;
  setAlbumGridScrollTop: (scrollTop: number) => void;
}

export const useViewStore = create<ViewState & ViewActions>()((set, get) => ({
  activeView: 'library',
  previousView: 'library',
  rightPanel: null,
  selectedPlaylistId: null,
  selectedAlbumName: null,
  albumGridScrollTop: 0,

  navigateTo: (view, playlistId) =>
    set({
      activeView: view,
      selectedPlaylistId: view === 'playlists' ? (playlistId ?? null) : null,
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
  setRightPanel: panel => set({ rightPanel: panel }),
  toggleRightPanel: panel => {
    const current = get().rightPanel;
    set({ rightPanel: current === panel ? null : panel });
  },
  selectAlbum: name => set({ selectedAlbumName: name }),
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
