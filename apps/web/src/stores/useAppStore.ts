import { create } from 'zustand';

export type AppView = 'library' | 'settings';

interface AppState {
  activeView: AppView;
}

interface AppActions {
  navigateTo: (view: AppView) => void;
}

export const useAppStore = create<AppState & AppActions>(set => ({
  activeView: 'library',
  navigateTo: (view) => set({ activeView: view }),
}));
