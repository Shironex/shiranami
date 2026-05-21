import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useViewStore, type AppView } from '@/stores/useViewStore';

export type VisualizerStyle = 'bars' | 'waveform' | 'circle' | 'particles';

/**
 * Plain value list backing `coerceVisualizerStyle`. Kept here (not imported
 * from the registry) so the store has no dependency on the registry, which
 * imports the `VisualizerStyle` type from this module — avoids an import cycle.
 */
export const VISUALIZER_STYLE_VALUES = [
  'bars',
  'waveform',
  'circle',
  'particles',
] as const satisfies readonly VisualizerStyle[];

export type LibraryViewMode = 'tracks' | 'albums';
export type AlbumGridSize = 'small' | 'medium' | 'large';
export type AlbumSortMode = 'name' | 'artist' | 'year' | 'recentlyAdded';
export type AlbumSortOrder = 'asc' | 'desc';

export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 120;
export const UI_SCALE_DEFAULT = 100;
export const UI_SCALE_STEP = 5;
export const UI_SCALE_PRESETS = [80, 90, 100, 110, 120] as const;

const STORE_KEY = 'shiranami.app-store';

const LEGACY_KEYS = {
  sidebarCollapsed: 'shiranami.sidebar-collapsed',
  sidebarHiddenItems: 'shiranami.sidebar-hidden-items',
  sidebarPlaylistsVisible: 'shiranami.sidebar-playlists-visible',
  compactAlwaysOnTop: 'shiranami.compact-always-on-top',
  showVisualizer: 'shiranami.visualizer-enabled',
  visualizerStyle: 'shiranami.visualizer-style',
  uiScale: 'shiranami.ui-scale',
  libraryViewMode: 'shiranami.library-view-mode',
  albumGridSize: 'shiranami.album-grid-size',
  playlistGridSize: 'shiranami.playlist-grid-size',
  albumSortMode: 'shiranami.album-sort-mode',
  albumSortOrder: 'shiranami.album-sort-order',
  nowPlayingViewEnabled: 'shiranami.now-playing-view-enabled',
  nowPlayingLyricsVisible: 'shiranami.now-playing-lyrics-visible',
  libraryHeroCardEnabled: 'shiranami.library-hero-card-enabled',
  lowPerformanceMode: 'shiranami.low-performance-mode',
  noiseOverlayEnabled: 'shiranami.noise-overlay-enabled',
} as const;

// --- Side-effect helpers (applied on rehydrate and from setters) ---

function applyUiScale(scale: number) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = `${scale}%`;
}

function applyLowPerformanceMode(enabled: boolean) {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.dataset.perfMode = 'low';
  } else {
    delete document.documentElement.dataset.perfMode;
  }
}

// --- Coercion helpers (mirror the original getInitial* behavior) ---

function coerceVisualizerStyle(v: unknown): VisualizerStyle {
  return (VISUALIZER_STYLE_VALUES as readonly string[]).includes(v as string)
    ? (v as VisualizerStyle)
    : 'bars';
}
function coerceLibraryViewMode(v: unknown): LibraryViewMode {
  return v === 'tracks' || v === 'albums' ? v : 'tracks';
}
function coerceGridSize(v: unknown): AlbumGridSize {
  return v === 'small' || v === 'medium' || v === 'large' ? v : 'medium';
}
function coerceAlbumSortMode(v: unknown): AlbumSortMode {
  return v === 'name' || v === 'artist' || v === 'year' || v === 'recentlyAdded' ? v : 'name';
}
function coerceAlbumSortOrder(v: unknown): AlbumSortOrder {
  return v === 'asc' || v === 'desc' ? v : 'asc';
}
function coerceUiScale(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return UI_SCALE_DEFAULT;
  return Math.round(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, parsed)));
}

// --- Sanitizer: defensively re-apply enum whitelists and numeric clamps ---

interface PersistedUIState {
  sidebarCollapsed: boolean;
  sidebarHiddenItems: AppView[];
  sidebarPlaylistsVisible: boolean;
  showVisualizer: boolean;
  visualizerStyle: VisualizerStyle;
  uiScale: number;
  libraryViewMode: LibraryViewMode;
  albumGridSize: AlbumGridSize;
  playlistGridSize: AlbumGridSize;
  albumSortMode: AlbumSortMode;
  albumSortOrder: AlbumSortOrder;
  nowPlayingViewEnabled: boolean;
  nowPlayingLyricsVisible: boolean;
  libraryHeroCardEnabled: boolean;
  lowPerformanceMode: boolean;
  noiseOverlayEnabled: boolean;
}

function sanitize(persisted: Partial<PersistedUIState> | undefined): Partial<PersistedUIState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedUIState> = {};
  if (typeof persisted.sidebarCollapsed === 'boolean')
    out.sidebarCollapsed = persisted.sidebarCollapsed;
  if (Array.isArray(persisted.sidebarHiddenItems))
    out.sidebarHiddenItems = persisted.sidebarHiddenItems as AppView[];
  if (typeof persisted.sidebarPlaylistsVisible === 'boolean')
    out.sidebarPlaylistsVisible = persisted.sidebarPlaylistsVisible;
  if (typeof persisted.showVisualizer === 'boolean') out.showVisualizer = persisted.showVisualizer;
  if (persisted.visualizerStyle !== undefined)
    out.visualizerStyle = coerceVisualizerStyle(persisted.visualizerStyle);
  if (persisted.uiScale !== undefined) out.uiScale = coerceUiScale(persisted.uiScale);
  if (persisted.libraryViewMode !== undefined)
    out.libraryViewMode = coerceLibraryViewMode(persisted.libraryViewMode);
  if (persisted.albumGridSize !== undefined)
    out.albumGridSize = coerceGridSize(persisted.albumGridSize);
  if (persisted.playlistGridSize !== undefined)
    out.playlistGridSize = coerceGridSize(persisted.playlistGridSize);
  if (persisted.albumSortMode !== undefined)
    out.albumSortMode = coerceAlbumSortMode(persisted.albumSortMode);
  if (persisted.albumSortOrder !== undefined)
    out.albumSortOrder = coerceAlbumSortOrder(persisted.albumSortOrder);
  if (typeof persisted.nowPlayingViewEnabled === 'boolean')
    out.nowPlayingViewEnabled = persisted.nowPlayingViewEnabled;
  if (typeof persisted.nowPlayingLyricsVisible === 'boolean')
    out.nowPlayingLyricsVisible = persisted.nowPlayingLyricsVisible;
  if (typeof persisted.libraryHeroCardEnabled === 'boolean')
    out.libraryHeroCardEnabled = persisted.libraryHeroCardEnabled;
  if (typeof persisted.lowPerformanceMode === 'boolean')
    out.lowPerformanceMode = persisted.lowPerformanceMode;
  if (typeof persisted.noiseOverlayEnabled === 'boolean')
    out.noiseOverlayEnabled = persisted.noiseOverlayEnabled;
  return out;
}

// --- Passthrough: fields in the shared bucket that belong to sibling stores ---

const UI_KEYS: ReadonlySet<keyof PersistedUIState> = new Set([
  'sidebarCollapsed',
  'sidebarHiddenItems',
  'sidebarPlaylistsVisible',
  'showVisualizer',
  'visualizerStyle',
  'uiScale',
  'libraryViewMode',
  'albumGridSize',
  'playlistGridSize',
  'albumSortMode',
  'albumSortOrder',
  'nowPlayingViewEnabled',
  'nowPlayingLyricsVisible',
  'libraryHeroCardEnabled',
  'lowPerformanceMode',
  'noiseOverlayEnabled',
]);

function readPassthroughLegacyFields(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    if (!parsed.state || typeof parsed.state !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.state)) {
      if (!UI_KEYS.has(k as keyof PersistedUIState)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// --- One-shot legacy import (runs at module load, before create()) ---

function importLegacyUIStore() {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage;
  if (ls.getItem(STORE_KEY)) return;
  const hasAny = Object.values(LEGACY_KEYS).some(k => ls.getItem(k) !== null);
  if (!hasAny) return;

  // Relaxed shape — we also copy `compactAlwaysOnTop` through so the
  // useCompactStore one-shot importer (which reads this same combined
  // bucket) can pick it up on next load. The field is no longer on
  // PersistedUIState since compact moved to its own store.
  const state: Partial<PersistedUIState> & { compactAlwaysOnTop?: boolean } = {};

  const sidebarCollapsed = ls.getItem(LEGACY_KEYS.sidebarCollapsed);
  if (sidebarCollapsed !== null) state.sidebarCollapsed = sidebarCollapsed === 'true';

  const sidebarHiddenItemsRaw = ls.getItem(LEGACY_KEYS.sidebarHiddenItems);
  if (sidebarHiddenItemsRaw !== null) {
    try {
      const parsed = JSON.parse(sidebarHiddenItemsRaw);
      if (Array.isArray(parsed)) state.sidebarHiddenItems = parsed as AppView[];
    } catch {
      /* noop */
    }
  }

  const sidebarPlaylistsVisible = ls.getItem(LEGACY_KEYS.sidebarPlaylistsVisible);
  if (sidebarPlaylistsVisible !== null)
    state.sidebarPlaylistsVisible = sidebarPlaylistsVisible !== 'false';

  const compactAlwaysOnTop = ls.getItem(LEGACY_KEYS.compactAlwaysOnTop);
  if (compactAlwaysOnTop !== null) state.compactAlwaysOnTop = compactAlwaysOnTop === 'true';

  const showVisualizer = ls.getItem(LEGACY_KEYS.showVisualizer);
  if (showVisualizer !== null) state.showVisualizer = showVisualizer !== 'false';

  const visualizerStyle = ls.getItem(LEGACY_KEYS.visualizerStyle);
  if (visualizerStyle !== null) state.visualizerStyle = coerceVisualizerStyle(visualizerStyle);

  const uiScaleRaw = ls.getItem(LEGACY_KEYS.uiScale);
  if (uiScaleRaw !== null) {
    const parsed = Number(uiScaleRaw);
    if (!Number.isNaN(parsed) && parsed >= UI_SCALE_MIN && parsed <= UI_SCALE_MAX) {
      state.uiScale = parsed;
    }
  }

  const libraryViewMode = ls.getItem(LEGACY_KEYS.libraryViewMode);
  if (libraryViewMode !== null) state.libraryViewMode = coerceLibraryViewMode(libraryViewMode);

  const albumGridSize = ls.getItem(LEGACY_KEYS.albumGridSize);
  if (albumGridSize !== null) state.albumGridSize = coerceGridSize(albumGridSize);

  const playlistGridSize = ls.getItem(LEGACY_KEYS.playlistGridSize);
  if (playlistGridSize !== null) state.playlistGridSize = coerceGridSize(playlistGridSize);

  const albumSortMode = ls.getItem(LEGACY_KEYS.albumSortMode);
  if (albumSortMode !== null) state.albumSortMode = coerceAlbumSortMode(albumSortMode);

  const albumSortOrder = ls.getItem(LEGACY_KEYS.albumSortOrder);
  if (albumSortOrder !== null) state.albumSortOrder = coerceAlbumSortOrder(albumSortOrder);

  const nowPlayingViewEnabled = ls.getItem(LEGACY_KEYS.nowPlayingViewEnabled);
  if (nowPlayingViewEnabled !== null)
    state.nowPlayingViewEnabled = nowPlayingViewEnabled === 'true';

  const nowPlayingLyricsVisible = ls.getItem(LEGACY_KEYS.nowPlayingLyricsVisible);
  if (nowPlayingLyricsVisible !== null)
    state.nowPlayingLyricsVisible = nowPlayingLyricsVisible !== 'false';

  const libraryHeroCardEnabled = ls.getItem(LEGACY_KEYS.libraryHeroCardEnabled);
  if (libraryHeroCardEnabled !== null)
    state.libraryHeroCardEnabled = libraryHeroCardEnabled !== 'false';

  const lowPerformanceMode = ls.getItem(LEGACY_KEYS.lowPerformanceMode);
  if (lowPerformanceMode !== null) state.lowPerformanceMode = lowPerformanceMode === 'true';

  const noiseOverlayEnabled = ls.getItem(LEGACY_KEYS.noiseOverlayEnabled);
  if (noiseOverlayEnabled !== null) state.noiseOverlayEnabled = noiseOverlayEnabled === 'true';

  ls.setItem(STORE_KEY, JSON.stringify({ state, version: 1 }));
  Object.values(LEGACY_KEYS).forEach(k => ls.removeItem(k));
}

importLegacyUIStore();

interface UIState {
  sidebarCollapsed: boolean;
  sidebarHiddenItems: AppView[];
  sidebarPlaylistsVisible: boolean;
  showVisualizer: boolean;
  visualizerStyle: VisualizerStyle;
  uiScale: number;
  libraryViewMode: LibraryViewMode;
  albumGridSize: AlbumGridSize;
  playlistGridSize: AlbumGridSize;
  albumSortMode: AlbumSortMode;
  albumSortOrder: AlbumSortOrder;
  nowPlayingViewEnabled: boolean;
  nowPlayingLyricsVisible: boolean;
  libraryHeroCardEnabled: boolean;
  lowPerformanceMode: boolean;
  noiseOverlayEnabled: boolean;
}

interface UIActions {
  setNowPlayingViewEnabled: (enabled: boolean) => void;
  toggleNowPlayingLyrics: () => void;
  setLibraryHeroCardEnabled: (enabled: boolean) => void;
  setLowPerformanceMode: (enabled: boolean) => void;
  setNoiseOverlayEnabled: (enabled: boolean) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  toggleSidebarItem: (view: AppView) => void;
  setSidebarPlaylistsVisible: (visible: boolean) => void;
  toggleVisualizer: () => void;
  setVisualizerStyle: (style: VisualizerStyle) => void;
  setUiScale: (scale: number) => void;
  resetUiScale: () => void;
  setLibraryViewMode: (mode: LibraryViewMode) => void;
  setAlbumGridSize: (size: AlbumGridSize) => void;
  setPlaylistGridSize: (size: AlbumGridSize) => void;
  setAlbumSortMode: (mode: AlbumSortMode) => void;
  setAlbumSortOrder: (order: AlbumSortOrder) => void;
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      sidebarHiddenItems: [],
      sidebarPlaylistsVisible: true,
      showVisualizer: true,
      visualizerStyle: 'bars',
      uiScale: UI_SCALE_DEFAULT,
      libraryViewMode: 'tracks',
      albumGridSize: 'medium',
      playlistGridSize: 'medium',
      albumSortMode: 'name',
      albumSortOrder: 'asc',
      nowPlayingViewEnabled: false,
      nowPlayingLyricsVisible: true,
      libraryHeroCardEnabled: true,
      lowPerformanceMode: false,
      noiseOverlayEnabled: false,

      setNowPlayingViewEnabled: enabled => {
        set({ nowPlayingViewEnabled: enabled });
        const view = useViewStore.getState();
        if (!enabled && view.activeView === 'now-playing') {
          view.exitNowPlaying();
        }
      },
      toggleNowPlayingLyrics: () => {
        set({ nowPlayingLyricsVisible: !get().nowPlayingLyricsVisible });
      },
      setLibraryHeroCardEnabled: enabled => {
        set({ libraryHeroCardEnabled: enabled });
      },
      setLowPerformanceMode: enabled => {
        applyLowPerformanceMode(enabled);
        set({ lowPerformanceMode: enabled });
      },
      setNoiseOverlayEnabled: enabled => {
        set({ noiseOverlayEnabled: enabled });
      },
      setSidebarCollapsed: sidebarCollapsed => {
        set({ sidebarCollapsed });
      },
      toggleSidebarCollapsed: () => {
        set({ sidebarCollapsed: !get().sidebarCollapsed });
      },
      toggleSidebarItem: view => {
        const current = get().sidebarHiddenItems;
        const next = current.includes(view) ? current.filter(v => v !== view) : [...current, view];
        set({ sidebarHiddenItems: next });
      },
      setSidebarPlaylistsVisible: visible => {
        set({ sidebarPlaylistsVisible: visible });
      },
      toggleVisualizer: () => {
        set({ showVisualizer: !get().showVisualizer });
      },
      setVisualizerStyle: style => {
        set({ visualizerStyle: style });
      },
      setUiScale: scale => {
        const clamped = Math.round(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale)));
        applyUiScale(clamped);
        set({ uiScale: clamped });
      },
      resetUiScale: () => {
        applyUiScale(UI_SCALE_DEFAULT);
        set({ uiScale: UI_SCALE_DEFAULT });
      },
      setLibraryViewMode: mode => {
        set({ libraryViewMode: mode });
        useViewStore.setState({ selectedAlbumName: null, albumGridScrollTop: 0 });
      },
      setAlbumGridSize: size => {
        set({ albumGridSize: size });
      },
      setPlaylistGridSize: size => {
        set({ playlistGridSize: size });
      },
      setAlbumSortMode: mode => {
        set({ albumSortMode: mode });
        // Scroll position is meaningless once album order changes.
        useViewStore.setState({ albumGridScrollTop: 0 });
      },
      setAlbumSortOrder: order => {
        set({ albumSortOrder: order });
        // Scroll position is meaningless once album order changes.
        useViewStore.setState({ albumGridScrollTop: 0 });
      },
    }),
    {
      name: STORE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: s =>
        ({
          ...readPassthroughLegacyFields(),
          sidebarCollapsed: s.sidebarCollapsed,
          sidebarHiddenItems: s.sidebarHiddenItems,
          sidebarPlaylistsVisible: s.sidebarPlaylistsVisible,
          showVisualizer: s.showVisualizer,
          visualizerStyle: s.visualizerStyle,
          uiScale: s.uiScale,
          libraryViewMode: s.libraryViewMode,
          albumGridSize: s.albumGridSize,
          playlistGridSize: s.playlistGridSize,
          albumSortMode: s.albumSortMode,
          albumSortOrder: s.albumSortOrder,
          nowPlayingViewEnabled: s.nowPlayingViewEnabled,
          nowPlayingLyricsVisible: s.nowPlayingLyricsVisible,
          libraryHeroCardEnabled: s.libraryHeroCardEnabled,
          lowPerformanceMode: s.lowPerformanceMode,
          noiseOverlayEnabled: s.noiseOverlayEnabled,
        }) as PersistedUIState,
      merge: (persisted, current) => ({
        ...current,
        ...sanitize(persisted as Partial<PersistedUIState>),
      }),
      onRehydrateStorage: () => state => {
        if (!state) return;
        applyUiScale(state.uiScale);
        applyLowPerformanceMode(state.lowPerformanceMode);
      },
    }
  )
);

if (import.meta.hot) {
  type HmrData = { store?: typeof useUIStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useUIStore.setState(data.store.getState());
  }
  data.store = useUIStore;
  hot.accept();
}
