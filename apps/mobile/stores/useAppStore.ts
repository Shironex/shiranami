import { create } from 'zustand';

type ThemeMode = 'dark' | 'light' | 'system';

interface AppState {
  themeMode: ThemeMode;
  serverUrl: string;
}

interface AppActions {
  setThemeMode: (mode: ThemeMode) => void;
  setServerUrl: (url: string) => void;
}

export const useAppStore = create<AppState & AppActions>(set => ({
  themeMode: 'dark',
  serverUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',

  setThemeMode: (themeMode) => set({ themeMode }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
}));
