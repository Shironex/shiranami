import { create } from 'zustand';

export type AppView = 'library' | 'playlists' | 'favorites' | 'search' | 'settings';
export type RightPanel = 'lyrics' | 'queue' | null;

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'shiranami.sidebar-collapsed';

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

function persistSidebarCollapsed(sidebarCollapsed: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    sidebarCollapsed ? 'true' : 'false'
  );
}

interface AppState {
  activeView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
  sidebarCollapsed: boolean;
  showVisualizer: boolean;
}

interface AppActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  selectPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
  toggleVisualizer: () => void;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  activeView: 'library',
  rightPanel: null,
  selectedPlaylistId: null,
  sidebarCollapsed: getInitialSidebarCollapsed(),
  showVisualizer: true,

  navigateTo: (view, playlistId) =>
    set({
      activeView: view,
      selectedPlaylistId: view === 'playlists' ? (playlistId ?? null) : null,
    }),
  selectPlaylist: (id) => set({ selectedPlaylistId: id }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    persistSidebarCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
  toggleSidebarCollapsed: () => {
    const sidebarCollapsed = !get().sidebarCollapsed;
    persistSidebarCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
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
