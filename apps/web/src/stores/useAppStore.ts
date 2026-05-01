import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { IS_ELECTRON } from '@/lib/platform';

export type AppView =
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
export type VisualizerStyle = 'bars' | 'waveform' | 'circle' | 'particles';
export type LibraryViewMode = 'tracks' | 'albums';
export type AlbumGridSize = 'small' | 'medium' | 'large';
export type AlbumSortMode = 'name' | 'artist' | 'year' | 'recentlyAdded';
export type AlbumSortOrder = 'asc' | 'desc';
export type LyricsFontSize = 'sm' | 'base' | 'lg' | 'xl';
/** @deprecated Use LyricsFontSize. Alias kept for back-compat with existing imports. */
export type LyricsPlainFontSize = LyricsFontSize;

export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 120;
export const UI_SCALE_DEFAULT = 100;
export const UI_SCALE_STEP = 5;
export const UI_SCALE_PRESETS = [80, 90, 100, 110, 120] as const;

export const LYRICS_PLAIN_OPACITY_MIN = 0.5;
export const LYRICS_PLAIN_OPACITY_MAX = 1.0;
export const LYRICS_PLAIN_OPACITY_STEP = 0.05;
export const LYRICS_PLAIN_OPACITY_DEFAULT = 0.9;
export const LYRICS_PLAIN_FONT_SIZE_DEFAULT: LyricsFontSize = 'base';

export const LYRICS_SYNCED_DIM_OPACITY_MIN = 0.2;
export const LYRICS_SYNCED_DIM_OPACITY_MAX = 1.0;
export const LYRICS_SYNCED_DIM_OPACITY_STEP = 0.05;
export const LYRICS_SYNCED_DIM_OPACITY_DEFAULT = 0.45;
export const LYRICS_SYNCED_FONT_SIZE_DEFAULT: LyricsFontSize = 'base';

/**
 * Original synced view used past=0.25 / idle=0.45. We preserve that ratio
 * (≈ 0.5556) so when the user dims idle, past dims proportionally and stays
 * visibly fainter than idle.
 */
export const LYRICS_SYNCED_PAST_RATIO = 0.25 / 0.45;

export const LYR_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-sm leading-6',
  base: 'text-base leading-7',
  lg: 'text-lg leading-8',
  xl: 'text-xl leading-9',
};

const FONT_SIZE_ORDER: LyricsFontSize[] = ['sm', 'base', 'lg', 'xl'];

/**
 * Active synced line uses one step larger than the user-selected base, capped
 * at xl. Mirrors the original hardcoded "base→lg active" behavior.
 */
export function nextLyricsFontSize(size: LyricsFontSize): LyricsFontSize {
  const idx = FONT_SIZE_ORDER.indexOf(size);
  if (idx < 0) return 'lg';
  return FONT_SIZE_ORDER[Math.min(idx + 1, FONT_SIZE_ORDER.length - 1)];
}

const NEW_KEY = 'shiranami.app-store';

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
  return v === 'bars' || v === 'waveform' || v === 'circle' || v === 'particles' ? v : 'bars';
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
function clampLyricsPlainOpacity(v: number): number {
  const clamped = Math.min(LYRICS_PLAIN_OPACITY_MAX, Math.max(LYRICS_PLAIN_OPACITY_MIN, v));
  // Round to nearest step to keep persisted values clean.
  const steps = Math.round(clamped / LYRICS_PLAIN_OPACITY_STEP);
  return Math.round(steps * LYRICS_PLAIN_OPACITY_STEP * 1000) / 1000;
}
function coerceLyricsPlainOpacity(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return LYRICS_PLAIN_OPACITY_DEFAULT;
  return clampLyricsPlainOpacity(parsed);
}
function coerceLyricsPlainFontSize(v: unknown): LyricsFontSize {
  return v === 'sm' || v === 'base' || v === 'lg' || v === 'xl'
    ? v
    : LYRICS_PLAIN_FONT_SIZE_DEFAULT;
}
function clampLyricsSyncedDimOpacity(v: number): number {
  const clamped = Math.min(
    LYRICS_SYNCED_DIM_OPACITY_MAX,
    Math.max(LYRICS_SYNCED_DIM_OPACITY_MIN, v)
  );
  const steps = Math.round(clamped / LYRICS_SYNCED_DIM_OPACITY_STEP);
  return Math.round(steps * LYRICS_SYNCED_DIM_OPACITY_STEP * 1000) / 1000;
}
function coerceLyricsSyncedDimOpacity(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(parsed)) return LYRICS_SYNCED_DIM_OPACITY_DEFAULT;
  return clampLyricsSyncedDimOpacity(parsed);
}
function coerceLyricsSyncedFontSize(v: unknown): LyricsFontSize {
  return v === 'sm' || v === 'base' || v === 'lg' || v === 'xl'
    ? v
    : LYRICS_SYNCED_FONT_SIZE_DEFAULT;
}
// --- Sanitizer: defensively re-apply enum whitelists and numeric clamps ---

interface PersistedAppState {
  sidebarCollapsed: boolean;
  sidebarHiddenItems: AppView[];
  sidebarPlaylistsVisible: boolean;
  compactAlwaysOnTop: boolean;
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
  lyricsPlainOpacity: number;
  lyricsPlainFontSize: LyricsFontSize;
  lyricsSyncedDimOpacity: number;
  lyricsSyncedFontSize: LyricsFontSize;
}

function sanitize(persisted: Partial<PersistedAppState> | undefined): Partial<PersistedAppState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedAppState> = {};
  if (typeof persisted.sidebarCollapsed === 'boolean')
    out.sidebarCollapsed = persisted.sidebarCollapsed;
  if (Array.isArray(persisted.sidebarHiddenItems))
    out.sidebarHiddenItems = persisted.sidebarHiddenItems as AppView[];
  if (typeof persisted.sidebarPlaylistsVisible === 'boolean')
    out.sidebarPlaylistsVisible = persisted.sidebarPlaylistsVisible;
  if (typeof persisted.compactAlwaysOnTop === 'boolean')
    out.compactAlwaysOnTop = persisted.compactAlwaysOnTop;
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
  if (persisted.lyricsPlainOpacity !== undefined)
    out.lyricsPlainOpacity = coerceLyricsPlainOpacity(persisted.lyricsPlainOpacity);
  if (persisted.lyricsPlainFontSize !== undefined)
    out.lyricsPlainFontSize = coerceLyricsPlainFontSize(persisted.lyricsPlainFontSize);
  if (persisted.lyricsSyncedDimOpacity !== undefined)
    out.lyricsSyncedDimOpacity = coerceLyricsSyncedDimOpacity(persisted.lyricsSyncedDimOpacity);
  if (persisted.lyricsSyncedFontSize !== undefined)
    out.lyricsSyncedFontSize = coerceLyricsSyncedFontSize(persisted.lyricsSyncedFontSize);
  return out;
}

// --- One-shot legacy import (runs at module load, before create()) ---

function importLegacyAppStore() {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage;
  if (ls.getItem(NEW_KEY)) return;
  const hasAny = Object.values(LEGACY_KEYS).some(k => ls.getItem(k) !== null);
  if (!hasAny) return;

  const state: Partial<PersistedAppState> = {};

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

  ls.setItem(NEW_KEY, JSON.stringify({ state, version: 1 }));
  Object.values(LEGACY_KEYS).forEach(k => ls.removeItem(k));
}

importLegacyAppStore();

interface AppState {
  activeView: AppView;
  rightPanel: RightPanel;
  selectedPlaylistId: string | null;
  sidebarCollapsed: boolean;
  compactMode: boolean;
  compactAlwaysOnTop: boolean;
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
  selectedAlbumName: string | null;
  albumGridScrollTop: number;
  nowPlayingViewEnabled: boolean;
  nowPlayingLyricsVisible: boolean;
  libraryHeroCardEnabled: boolean;
  lowPerformanceMode: boolean;
  noiseOverlayEnabled: boolean;
  lyricsPlainOpacity: number;
  lyricsPlainFontSize: LyricsFontSize;
  lyricsSyncedDimOpacity: number;
  lyricsSyncedFontSize: LyricsFontSize;
  previousView: AppView;
}

interface AppActions {
  navigateTo: (view: AppView, playlistId?: string | null) => void;
  enterNowPlaying: () => void;
  exitNowPlaying: () => void;
  setNowPlayingViewEnabled: (enabled: boolean) => void;
  toggleNowPlayingLyrics: () => void;
  setLibraryHeroCardEnabled: (enabled: boolean) => void;
  setLowPerformanceMode: (enabled: boolean) => void;
  setNoiseOverlayEnabled: (enabled: boolean) => void;
  selectPlaylist: (id: string | null) => void;
  setRightPanel: (panel: RightPanel) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  setCompactMode: (compactMode: boolean) => Promise<void>;
  setCompactAlwaysOnTop: (compactAlwaysOnTop: boolean) => Promise<void>;
  toggleCompactMode: () => Promise<void>;
  toggleCompactAlwaysOnTop: () => Promise<void>;
  toggleSidebarCollapsed: () => void;
  toggleSidebarItem: (view: AppView) => void;
  setSidebarPlaylistsVisible: (visible: boolean) => void;
  toggleRightPanel: (panel: 'lyrics' | 'queue') => void;
  toggleVisualizer: () => void;
  setVisualizerStyle: (style: VisualizerStyle) => void;
  setUiScale: (scale: number) => void;
  resetUiScale: () => void;
  setLibraryViewMode: (mode: LibraryViewMode) => void;
  setAlbumGridSize: (size: AlbumGridSize) => void;
  setPlaylistGridSize: (size: AlbumGridSize) => void;
  setAlbumSortMode: (mode: AlbumSortMode) => void;
  setAlbumSortOrder: (order: AlbumSortOrder) => void;
  selectAlbum: (name: string | null) => void;
  setAlbumGridScrollTop: (scrollTop: number) => void;
  setLyricsPlainOpacity: (value: number) => void;
  setLyricsPlainFontSize: (size: LyricsFontSize) => void;
  resetLyricsPlainAppearance: () => void;
  setLyricsSyncedDimOpacity: (value: number) => void;
  setLyricsSyncedFontSize: (size: LyricsFontSize) => void;
  resetLyricsAppearance: () => void;
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      activeView: 'library',
      rightPanel: null,
      selectedPlaylistId: null,
      sidebarCollapsed: false,
      sidebarHiddenItems: [],
      sidebarPlaylistsVisible: true,
      compactMode: false,
      compactAlwaysOnTop: false,
      showVisualizer: true,
      visualizerStyle: 'bars',
      uiScale: UI_SCALE_DEFAULT,
      libraryViewMode: 'tracks',
      albumGridSize: 'medium',
      playlistGridSize: 'medium',
      albumSortMode: 'name',
      albumSortOrder: 'asc',
      selectedAlbumName: null,
      albumGridScrollTop: 0,
      nowPlayingViewEnabled: false,
      nowPlayingLyricsVisible: true,
      libraryHeroCardEnabled: true,
      lowPerformanceMode: false,
      noiseOverlayEnabled: false,
      lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
      lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
      lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
      lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
      previousView: 'library',

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
      setNowPlayingViewEnabled: enabled => {
        set({ nowPlayingViewEnabled: enabled });
        if (!enabled && get().activeView === 'now-playing') {
          get().exitNowPlaying();
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
      selectPlaylist: id => set({ selectedPlaylistId: id }),
      setRightPanel: panel => set({ rightPanel: panel }),
      setSidebarCollapsed: sidebarCollapsed => {
        set({ sidebarCollapsed });
      },
      setCompactMode: async compactMode => {
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
      setCompactAlwaysOnTop: async compactAlwaysOnTop => {
        const previous = get().compactAlwaysOnTop;
        if (previous === compactAlwaysOnTop) return;

        set({ compactAlwaysOnTop });

        if (!IS_ELECTRON || !get().compactMode) return;

        try {
          await window.electronAPI.window.setAlwaysOnTop(compactAlwaysOnTop);
        } catch {
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
      toggleRightPanel: panel => {
        const current = get().rightPanel;
        set({ rightPanel: current === panel ? null : panel });
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
        set({ libraryViewMode: mode, selectedAlbumName: null, albumGridScrollTop: 0 });
      },
      setAlbumGridSize: size => {
        set({ albumGridSize: size });
      },
      setPlaylistGridSize: size => {
        set({ playlistGridSize: size });
      },
      setAlbumSortMode: mode => {
        // Scroll position is meaningless once album order changes.
        set({ albumSortMode: mode, albumGridScrollTop: 0 });
      },
      setAlbumSortOrder: order => {
        // Scroll position is meaningless once album order changes.
        set({ albumSortOrder: order, albumGridScrollTop: 0 });
      },
      selectAlbum: name => set({ selectedAlbumName: name }),
      setAlbumGridScrollTop: scrollTop => set({ albumGridScrollTop: scrollTop }),
      setLyricsPlainOpacity: value => {
        set({ lyricsPlainOpacity: coerceLyricsPlainOpacity(value) });
      },
      setLyricsPlainFontSize: size => {
        set({ lyricsPlainFontSize: coerceLyricsPlainFontSize(size) });
      },
      resetLyricsPlainAppearance: () => {
        set({
          lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
          lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
        });
      },
      setLyricsSyncedDimOpacity: value => {
        set({ lyricsSyncedDimOpacity: coerceLyricsSyncedDimOpacity(value) });
      },
      setLyricsSyncedFontSize: size => {
        set({ lyricsSyncedFontSize: coerceLyricsSyncedFontSize(size) });
      },
      resetLyricsAppearance: () => {
        set({
          lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
          lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
          lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
          lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
        });
      },
    }),
    {
      name: NEW_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarHiddenItems: s.sidebarHiddenItems,
        sidebarPlaylistsVisible: s.sidebarPlaylistsVisible,
        compactAlwaysOnTop: s.compactAlwaysOnTop,
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
        lyricsPlainOpacity: s.lyricsPlainOpacity,
        lyricsPlainFontSize: s.lyricsPlainFontSize,
        lyricsSyncedDimOpacity: s.lyricsSyncedDimOpacity,
        lyricsSyncedFontSize: s.lyricsSyncedFontSize,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitize(persisted as Partial<PersistedAppState>),
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
  type HmrData = { store?: typeof useAppStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useAppStore.setState(data.store.getState());
  }
  data.store = useAppStore;
  hot.accept();
}
