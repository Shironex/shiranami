import { create } from 'zustand';

export type AppView = 'library' | 'playlists' | 'favorites' | 'settings';
export type RightPanel = 'lyrics' | 'queue' | null;

interface AppState {
  activeView: AppView;
  rightPanel: RightPanel;
}

interface AppActions {
  navigateTo: (view: AppView) => void;
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  activeView: 'library',
  rightPanel: 'lyrics',

  navigateTo: (view) => set({ activeView: view }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) => {
    const current = get().rightPanel;
    set({ rightPanel: current === panel ? null : panel });
  },
}));
