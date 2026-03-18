import { create } from 'zustand';

export type AppView = 'library' | 'playlists' | 'favorites' | 'search' | 'settings';
export type RightPanel = 'lyrics' | 'queue' | null;

interface AppState {
  activeView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
  showVisualizer: boolean;
}

interface AppActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  selectPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
  toggleVisualizer: () => void;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  activeView: 'library',
  rightPanel: 'lyrics',
  selectedPlaylistId: null,
  showVisualizer: true,

  navigateTo: (view, playlistId) =>
    set({
      activeView: view,
      selectedPlaylistId: view === 'playlists' ? (playlistId ?? null) : null,
    }),
  selectPlaylist: (id) => set({ selectedPlaylistId: id }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) => {
    const current = get().rightPanel;
    set({ rightPanel: current === panel ? null : panel });
  },
  toggleVisualizer: () => set((s) => ({ showVisualizer: !s.showVisualizer })),
}));

if (import.meta.hot) {
  if (import.meta.hot.data.store) {
    useAppStore.setState(import.meta.hot.data.store.getState());
  }
  import.meta.hot.data.store = useAppStore;
  import.meta.hot.accept();
}
