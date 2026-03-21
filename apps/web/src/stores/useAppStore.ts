import { create } from 'zustand';
import { IS_ELECTRON } from '@/lib/platform';

export type AppView = 'library' | 'playlists' | 'favorites' | 'history' | 'search' | 'radio' | 'settings' | 'import-playlist';
export type RightPanel = 'lyrics' | 'queue' | null;
export type VisualizerStyle = 'bars' | 'waveform';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'shiranami.sidebar-collapsed';
const VISUALIZER_STYLE_STORAGE_KEY = 'shiranami.visualizer-style';
const VISUALIZER_ENABLED_STORAGE_KEY = 'shiranami.visualizer-enabled';
const COMPACT_ALWAYS_ON_TOP_STORAGE_KEY = 'shiranami.compact-always-on-top';

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

function getInitialVisualizerStyle(): VisualizerStyle {
  if (typeof window === 'undefined') return 'bars';
  const stored = window.localStorage.getItem(VISUALIZER_STYLE_STORAGE_KEY);
  if (stored === 'bars' || stored === 'waveform') return stored;
  return 'bars';
}

function persistVisualizerStyle(style: VisualizerStyle) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VISUALIZER_STYLE_STORAGE_KEY, style);
}

function getInitialVisualizerEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(VISUALIZER_ENABLED_STORAGE_KEY);
  if (stored === 'false') return false;
  return true;
}

function persistVisualizerEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VISUALIZER_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
}

function getInitialCompactAlwaysOnTop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COMPACT_ALWAYS_ON_TOP_STORAGE_KEY) === 'true';
}

function persistCompactAlwaysOnTop(compactAlwaysOnTop: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    COMPACT_ALWAYS_ON_TOP_STORAGE_KEY,
    compactAlwaysOnTop ? 'true' : 'false'
  );
}

interface AppState {
  activeView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
  sidebarCollapsed: boolean;
  compactMode: boolean;
  compactAlwaysOnTop: boolean;
  showVisualizer: boolean;
  visualizerStyle: VisualizerStyle;
}

interface AppActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  selectPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  setCompactMode: (compactMode: boolean) => Promise<void>;
  setCompactAlwaysOnTop: (compactAlwaysOnTop: boolean) => Promise<void>;
  toggleCompactMode: () => Promise<void>;
  toggleCompactAlwaysOnTop: () => Promise<void>;
  toggleSidebarCollapsed: () => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
  toggleVisualizer: () => void;
  setVisualizerStyle: (style: VisualizerStyle) => void;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  activeView: 'library',
  rightPanel: null,
  selectedPlaylistId: null,
  sidebarCollapsed: getInitialSidebarCollapsed(),
  compactMode: false,
  compactAlwaysOnTop: getInitialCompactAlwaysOnTop(),
  showVisualizer: getInitialVisualizerEnabled(),
  visualizerStyle: getInitialVisualizerStyle(),

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
  setCompactMode: async (compactMode) => {
    const previous = get().compactMode;
    if (previous === compactMode) return;

    set({ compactMode });

    if (!IS_ELECTRON) return;

    try {
      await window.electronAPI.window.setCompactMode(compactMode);
      if (get().compactAlwaysOnTop) {
        await window.electronAPI.window.setAlwaysOnTop(compactMode);
      }
    } catch {
      if (compactMode && get().compactAlwaysOnTop) {
        try {
          await window.electronAPI.window.setAlwaysOnTop(false);
        } catch {
          // noop
        }
      }
      set({ compactMode: previous });
    }
  },
  setCompactAlwaysOnTop: async (compactAlwaysOnTop) => {
    const previous = get().compactAlwaysOnTop;
    if (previous === compactAlwaysOnTop) return;

    persistCompactAlwaysOnTop(compactAlwaysOnTop);
    set({ compactAlwaysOnTop });

    if (!IS_ELECTRON || !get().compactMode) return;

    try {
      await window.electronAPI.window.setAlwaysOnTop(compactAlwaysOnTop);
    } catch {
      persistCompactAlwaysOnTop(previous);
      set({ compactAlwaysOnTop: previous });
    }
  },
  toggleCompactMode: async () => {
    await get().setCompactMode(!get().compactMode);
  },
  toggleCompactAlwaysOnTop: async () => {
    await get().setCompactAlwaysOnTop(!get().compactAlwaysOnTop);
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
  toggleVisualizer: () => {
    const next = !get().showVisualizer;
    persistVisualizerEnabled(next);
    set({ showVisualizer: next });
  },
  setVisualizerStyle: (style) => {
    persistVisualizerStyle(style);
    set({ visualizerStyle: style });
  },
}));

if (import.meta.hot) {
  if (import.meta.hot.data.store) {
    useAppStore.setState(import.meta.hot.data.store.getState());
  }
  import.meta.hot.data.store = useAppStore;
  import.meta.hot.accept();
}
