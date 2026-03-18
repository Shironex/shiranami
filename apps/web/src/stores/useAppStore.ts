import { create } from 'zustand';

export type AppView = 'library' | 'playlists' | 'favorites' | 'settings';
export type RightPanel = 'lyrics' | 'queue' | null;

interface AppState {
  activeView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
}

interface AppActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  selectPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  activeView: 'library',
  rightPanel: 'lyrics',
  selectedPlaylistId: null,

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
}));
