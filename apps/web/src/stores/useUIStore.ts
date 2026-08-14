import { clamp } from '@shiranami/shared';
import { arrayMove } from '@/lib/array';
import { createPersistedStore, coerceEnum, acceptStoreHmr } from '@/lib/createPersistedStore';
import { useViewStore, type AppView, type PlayerSidePanel } from '@/stores/useViewStore';
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  DEFAULT_HIDDEN_SIDEBAR_ITEMS,
  DEFAULT_SIDEBAR_ORDER,
  sanitizeSidebarOrder,
} from '@/lib/sidebar-items';

export type VisualizerStyle =
  | 'bars'
  | 'waveform'
  | 'circle'
  | 'particles'
  | 'mirror'
  | 'mountain'
  | 'rings'
  | 'vinyl'
  | 'liquid'
  | 'constellation'
  | 'vu'
  | 'kanji';

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
  'mirror',
  'mountain',
  'rings',
  'vinyl',
  'liquid',
  'constellation',
  'vu',
  'kanji',
] as const satisfies readonly VisualizerStyle[];

/** What the vinyl record's center label shows. */
export type VinylLabelSource = 'artwork' | 'logo';
/** The audio-reactive ring drawn around the vinyl disc. */
export type VinylRingStyle = 'off' | 'glow' | 'spectrum';

export const VINYL_LABEL_SOURCES = [
  'artwork',
  'logo',
] as const satisfies readonly VinylLabelSource[];
export const VINYL_RING_STYLES = [
  'off',
  'glow',
  'spectrum',
] as const satisfies readonly VinylRingStyle[];

export const VINYL_LABEL_SOURCE_DEFAULT: VinylLabelSource = 'artwork';
export const VINYL_RING_STYLE_DEFAULT: VinylRingStyle = 'glow';

/**
 * Which room-light stop the grade holds at; `auto` follows the local clock.
 * The stop keys mirror `ROOM_LIGHT_STOPS` in `useRoomLight` — pinned by a test
 * there rather than imported, keeping this store free of hook dependencies.
 */
export type RoomLightStopSetting = 'auto' | 'dawn' | 'day' | 'goldenHour' | 'dusk' | 'night';

export const ROOM_LIGHT_STOP_SETTINGS = [
  'auto',
  'dawn',
  'day',
  'goldenHour',
  'dusk',
  'night',
] as const satisfies readonly RoomLightStopSetting[];

export const ROOM_LIGHT_STOP_DEFAULT: RoomLightStopSetting = 'auto';

/** Grade strength in percent; 100 is the authored look, 150 leans into it. */
export const ROOM_LIGHT_INTENSITY_MIN = 0;
export const ROOM_LIGHT_INTENSITY_MAX = 150;
export const ROOM_LIGHT_INTENSITY_DEFAULT = 100;
export const ROOM_LIGHT_INTENSITY_STEP = 5;

/** Warmth hue nudge in degrees, applied to the tint wash and the lamp pool. */
export const ROOM_LIGHT_HUE_SHIFT_MIN = -30;
export const ROOM_LIGHT_HUE_SHIFT_MAX = 30;
export const ROOM_LIGHT_HUE_SHIFT_DEFAULT = 0;
export const ROOM_LIGHT_HUE_SHIFT_STEP = 5;

export type LibraryViewMode = 'tracks' | 'albums';
export type AlbumGridSize = 'small' | 'medium' | 'large';
export type AlbumSortMode = 'name' | 'artist' | 'year' | 'recentlyAdded';
export type AlbumSortOrder = 'asc' | 'desc';
/**
 * Which panel the full-screen Now Playing view shows in its right column. Shares
 * the lyrics/queue base with the player-bar `RightPanel` (useViewStore) and adds
 * an `eq` option that only this surface exposes.
 */
export type NowPlayingPanel = PlayerSidePanel | 'eq' | null;
/** The view the app opens to on launch. */
export type LandingView = 'overview' | 'library';

/** Default landing view for a fresh install — Overview is the new home. */
export const LANDING_VIEW_DEFAULT: LandingView = 'overview';

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
function coerceNowPlayingPanel(v: unknown): NowPlayingPanel {
  return v === 'lyrics' || v === 'queue' || v === 'eq' || v === null ? v : 'lyrics';
}
function coerceUiScale(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return UI_SCALE_DEFAULT;
  return Math.round(clamp(parsed, UI_SCALE_MIN, UI_SCALE_MAX));
}
function coerceLandingView(v: unknown): LandingView {
  return v === 'overview' || v === 'library' ? v : LANDING_VIEW_DEFAULT;
}
function coerceRoomLightIntensity(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return ROOM_LIGHT_INTENSITY_DEFAULT;
  return Math.round(clamp(parsed, ROOM_LIGHT_INTENSITY_MIN, ROOM_LIGHT_INTENSITY_MAX));
}
function coerceRoomLightHueShift(v: unknown): number {
  const parsed = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(parsed)) return ROOM_LIGHT_HUE_SHIFT_DEFAULT;
  return Math.round(clamp(parsed, ROOM_LIGHT_HUE_SHIFT_MIN, ROOM_LIGHT_HUE_SHIFT_MAX));
}

// --- Sanitizer: defensively re-apply enum whitelists and numeric clamps ---

interface PersistedUIState {
  sidebarCollapsed: boolean;
  sidebarHiddenItems: AppView[];
  sidebarOrder: AppView[];
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
  nowPlayingPanel: NowPlayingPanel;
  libraryHeroCardEnabled: boolean;
  lowPerformanceMode: boolean;
  noiseOverlayEnabled: boolean;
  tempoBreathingEnabled: boolean;
  artworkBloomEnabled: boolean;
  coverCrossfadeEnabled: boolean;
  vinylDisplayEnabled: boolean;
  vinylLabelSource: VinylLabelSource;
  vinylRingStyle: VinylRingStyle;
  roomLightEnabled: boolean;
  roomLightIntensity: number;
  roomLightStop: RoomLightStopSetting;
  roomLightHueShift: number;
  landingView: LandingView;
}

// Legacy fields that may still live in the persisted bucket from older
// versions but are absent from the current persisted shape. Read-only during
// sanitize so we can migrate them forward, then drop them.
type LegacyPersistedUIState = Partial<PersistedUIState> & {
  nowPlayingLyricsVisible?: boolean;
};

function sanitize(persisted: LegacyPersistedUIState | undefined): Partial<PersistedUIState> {
  if (!persisted || typeof persisted !== 'object') return {};
  const out: Partial<PersistedUIState> = {};
  if (typeof persisted.sidebarCollapsed === 'boolean')
    out.sidebarCollapsed = persisted.sidebarCollapsed;
  if (Array.isArray(persisted.sidebarHiddenItems))
    out.sidebarHiddenItems = (persisted.sidebarHiddenItems as AppView[]).filter(
      id => !ALWAYS_VISIBLE_SIDEBAR_ITEMS.has(id)
    );
  // Reconcile against the current nav items: unknown ids are dropped and views
  // added in a newer version are appended, so a stale order never makes a
  // sidebar item disappear. Only applied when an order was actually persisted;
  // otherwise the current default (a complete list) stands.
  if (persisted.sidebarOrder !== undefined)
    out.sidebarOrder = sanitizeSidebarOrder(persisted.sidebarOrder);
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
  if (persisted.nowPlayingPanel !== undefined) {
    out.nowPlayingPanel = coerceNowPlayingPanel(persisted.nowPlayingPanel);
  } else if (typeof persisted.nowPlayingLyricsVisible === 'boolean') {
    // Migrate the legacy boolean toggle: lyrics-on => 'lyrics', off => null.
    out.nowPlayingPanel = persisted.nowPlayingLyricsVisible ? 'lyrics' : null;
  }
  if (typeof persisted.libraryHeroCardEnabled === 'boolean')
    out.libraryHeroCardEnabled = persisted.libraryHeroCardEnabled;
  if (typeof persisted.lowPerformanceMode === 'boolean')
    out.lowPerformanceMode = persisted.lowPerformanceMode;
  if (typeof persisted.noiseOverlayEnabled === 'boolean')
    out.noiseOverlayEnabled = persisted.noiseOverlayEnabled;
  if (typeof persisted.tempoBreathingEnabled === 'boolean')
    out.tempoBreathingEnabled = persisted.tempoBreathingEnabled;
  if (typeof persisted.artworkBloomEnabled === 'boolean')
    out.artworkBloomEnabled = persisted.artworkBloomEnabled;
  if (typeof persisted.coverCrossfadeEnabled === 'boolean')
    out.coverCrossfadeEnabled = persisted.coverCrossfadeEnabled;
  if (typeof persisted.vinylDisplayEnabled === 'boolean')
    out.vinylDisplayEnabled = persisted.vinylDisplayEnabled;
  if (persisted.vinylLabelSource !== undefined)
    out.vinylLabelSource = coerceEnum(
      persisted.vinylLabelSource,
      VINYL_LABEL_SOURCES,
      VINYL_LABEL_SOURCE_DEFAULT
    );
  if (persisted.vinylRingStyle !== undefined)
    out.vinylRingStyle = coerceEnum(
      persisted.vinylRingStyle,
      VINYL_RING_STYLES,
      VINYL_RING_STYLE_DEFAULT
    );
  if (typeof persisted.roomLightEnabled === 'boolean')
    out.roomLightEnabled = persisted.roomLightEnabled;
  if (persisted.roomLightIntensity !== undefined)
    out.roomLightIntensity = coerceRoomLightIntensity(persisted.roomLightIntensity);
  if (persisted.roomLightStop !== undefined)
    out.roomLightStop = coerceEnum(
      persisted.roomLightStop,
      ROOM_LIGHT_STOP_SETTINGS,
      ROOM_LIGHT_STOP_DEFAULT
    );
  if (persisted.roomLightHueShift !== undefined)
    out.roomLightHueShift = coerceRoomLightHueShift(persisted.roomLightHueShift);
  if (persisted.landingView !== undefined)
    out.landingView = coerceLandingView(persisted.landingView);
  return out;
}

// --- Passthrough: fields in the shared bucket that belong to sibling stores ---

// Includes the legacy `nowPlayingLyricsVisible` so that, once migrated to
// `nowPlayingPanel`, the stale boolean is treated as ours and dropped from
// future writes rather than being re-injected by the passthrough below.
const UI_KEYS: ReadonlySet<string> = new Set([
  'sidebarCollapsed',
  'sidebarHiddenItems',
  'sidebarOrder',
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
  'nowPlayingPanel',
  'nowPlayingLyricsVisible',
  'libraryHeroCardEnabled',
  'lowPerformanceMode',
  'noiseOverlayEnabled',
  'tempoBreathingEnabled',
  'artworkBloomEnabled',
  'coverCrossfadeEnabled',
  'vinylDisplayEnabled',
  'vinylLabelSource',
  'vinylRingStyle',
  'roomLightEnabled',
  'roomLightIntensity',
  'roomLightStop',
  'roomLightHueShift',
  'landingView',
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
      if (!UI_KEYS.has(k)) out[k] = v;
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
  // bucket) can pick it up on next load. The field lives in useCompactStore,
  // not PersistedUIState.
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
    state.nowPlayingPanel = nowPlayingLyricsVisible !== 'false' ? 'lyrics' : null;

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
  sidebarOrder: AppView[];
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
  nowPlayingPanel: NowPlayingPanel;
  libraryHeroCardEnabled: boolean;
  /**
   * v2 visual-feature gate map — which store owns which toggle:
   *
   * - useUIStore (here): `artworkBloomEnabled` (four-layer album-art bloom +
   *   its track-change pulse), `coverCrossfadeEnabled` (the visual dissolve
   *   between records — distinct from the audio crossfade, which lives in
   *   usePlaybackStore), `tempoBreathingEnabled` (BPM-locked breathing),
   *   `noiseOverlayEnabled` (film-grain overlay), `roomLightEnabled` (the
   *   time-of-day lighting grade over the ambient scene), and
   *   `lowPerformanceMode` (master kill for all ambient rendering, including
   *   palette extraction in useAmbientColor).
   * - useAccentStore: `followArtAccent` — accent follows the cover's palette.
   * - useSanctuaryStore: Sanctuary Mode (fullscreen immersive player).
   * - useLyricsAppearanceStore: `lyricsPresentation` — list vs. focus stage.
   */
  lowPerformanceMode: boolean;
  noiseOverlayEnabled: boolean;
  tempoBreathingEnabled: boolean;
  artworkBloomEnabled: boolean;
  coverCrossfadeEnabled: boolean;
  /**
   * Vinyl record display: swap the Now Playing artwork card for a spinning
   * vinyl disc. The label source and reactive ring below only matter while
   * this master gate is on (the Sanctuary vinyl variant also honors them).
   */
  vinylDisplayEnabled: boolean;
  vinylLabelSource: VinylLabelSource;
  vinylRingStyle: VinylRingStyle;
  roomLightEnabled: boolean;
  /**
   * Room-light shaping, honored only while `roomLightEnabled` is on: grade
   * strength in percent (0–150), the stop the grade holds at (`auto` follows
   * the clock), and the warmth hue nudge in degrees.
   */
  roomLightIntensity: number;
  roomLightStop: RoomLightStopSetting;
  roomLightHueShift: number;
  landingView: LandingView;
}

interface UIActions {
  setNowPlayingViewEnabled: (enabled: boolean) => void;
  setNowPlayingPanel: (panel: NowPlayingPanel) => void;
  /** Show the panel, or hide it (back to `null`) when it is already active. */
  toggleNowPlayingPanel: (panel: Exclude<NowPlayingPanel, null>) => void;
  setLibraryHeroCardEnabled: (enabled: boolean) => void;
  setLowPerformanceMode: (enabled: boolean) => void;
  setNoiseOverlayEnabled: (enabled: boolean) => void;
  setTempoBreathingEnabled: (enabled: boolean) => void;
  setArtworkBloomEnabled: (enabled: boolean) => void;
  setCoverCrossfadeEnabled: (enabled: boolean) => void;
  setVinylDisplayEnabled: (enabled: boolean) => void;
  setVinylLabelSource: (source: VinylLabelSource) => void;
  setVinylRingStyle: (style: VinylRingStyle) => void;
  setRoomLightEnabled: (enabled: boolean) => void;
  setRoomLightIntensity: (intensity: number) => void;
  setRoomLightStop: (stop: RoomLightStopSetting) => void;
  setRoomLightHueShift: (degrees: number) => void;
  setLandingView: (view: LandingView) => void;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  toggleSidebarItem: (view: AppView) => void;
  /** Move `activeId` to the slot currently held by `overId` in the sidebar order. */
  reorderSidebarItem: (activeId: AppView, overId: AppView) => void;
  /** Restore the default sidebar order and clear all hidden items. */
  resetSidebar: () => void;
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

export const useUIStore = createPersistedStore<UIState & UIActions>(
  (set, get) => ({
    sidebarCollapsed: false,
    sidebarHiddenItems: [...DEFAULT_HIDDEN_SIDEBAR_ITEMS],
    sidebarOrder: DEFAULT_SIDEBAR_ORDER,
    sidebarPlaylistsVisible: true,
    showVisualizer: true,
    visualizerStyle: 'bars',
    uiScale: UI_SCALE_DEFAULT,
    libraryViewMode: 'tracks',
    albumGridSize: 'medium',
    playlistGridSize: 'medium',
    albumSortMode: 'name',
    albumSortOrder: 'asc',
    // On by default since v2: Lyric Focus and the BPM/key line live inside
    // the Now Playing view, so a fresh profile should be able to reach them.
    // Persisted users keep whatever they chose (sanitize honors the stored
    // boolean); only fresh profiles pick up the new default.
    nowPlayingViewEnabled: true,
    nowPlayingPanel: 'lyrics',
    libraryHeroCardEnabled: true,
    lowPerformanceMode: false,
    noiseOverlayEnabled: false,
    tempoBreathingEnabled: true,
    artworkBloomEnabled: true,
    coverCrossfadeEnabled: true,
    vinylDisplayEnabled: false,
    vinylLabelSource: VINYL_LABEL_SOURCE_DEFAULT,
    vinylRingStyle: VINYL_RING_STYLE_DEFAULT,
    roomLightEnabled: true,
    roomLightIntensity: ROOM_LIGHT_INTENSITY_DEFAULT,
    roomLightStop: ROOM_LIGHT_STOP_DEFAULT,
    roomLightHueShift: ROOM_LIGHT_HUE_SHIFT_DEFAULT,
    landingView: LANDING_VIEW_DEFAULT,

    setNowPlayingViewEnabled: enabled => {
      set({ nowPlayingViewEnabled: enabled });
      const view = useViewStore.getState();
      if (!enabled && view.activeView === 'now-playing') {
        view.exitNowPlaying();
      }
    },
    setNowPlayingPanel: panel => {
      set({ nowPlayingPanel: panel });
    },
    toggleNowPlayingPanel: panel => {
      set({ nowPlayingPanel: get().nowPlayingPanel === panel ? null : panel });
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
    setTempoBreathingEnabled: enabled => {
      set({ tempoBreathingEnabled: enabled });
    },
    setArtworkBloomEnabled: enabled => {
      set({ artworkBloomEnabled: enabled });
    },
    setCoverCrossfadeEnabled: enabled => {
      set({ coverCrossfadeEnabled: enabled });
    },
    setVinylDisplayEnabled: enabled => {
      set({ vinylDisplayEnabled: enabled });
    },
    setVinylLabelSource: source => {
      set({
        vinylLabelSource: coerceEnum(source, VINYL_LABEL_SOURCES, VINYL_LABEL_SOURCE_DEFAULT),
      });
    },
    setVinylRingStyle: style => {
      set({ vinylRingStyle: coerceEnum(style, VINYL_RING_STYLES, VINYL_RING_STYLE_DEFAULT) });
    },
    setRoomLightEnabled: enabled => {
      set({ roomLightEnabled: enabled });
    },
    setRoomLightIntensity: intensity => {
      set({ roomLightIntensity: coerceRoomLightIntensity(intensity) });
    },
    setRoomLightStop: stop => {
      set({ roomLightStop: coerceEnum(stop, ROOM_LIGHT_STOP_SETTINGS, ROOM_LIGHT_STOP_DEFAULT) });
    },
    setRoomLightHueShift: degrees => {
      set({ roomLightHueShift: coerceRoomLightHueShift(degrees) });
    },
    setLandingView: view => {
      set({ landingView: view });
    },
    setSidebarCollapsed: sidebarCollapsed => {
      set({ sidebarCollapsed });
    },
    toggleSidebarCollapsed: () => {
      set({ sidebarCollapsed: !get().sidebarCollapsed });
    },
    toggleSidebarItem: view => {
      // Always-visible items (settings) have no hide state — ignore the toggle
      // so the user can never strand themselves out of the customization UI.
      if (ALWAYS_VISIBLE_SIDEBAR_ITEMS.has(view)) return;
      const current = get().sidebarHiddenItems;
      const next = current.includes(view) ? current.filter(v => v !== view) : [...current, view];
      set({ sidebarHiddenItems: next });
    },
    reorderSidebarItem: (activeId, overId) => {
      const order = get().sidebarOrder;
      const oldIndex = order.indexOf(activeId);
      const newIndex = order.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      set({ sidebarOrder: arrayMove(order, oldIndex, newIndex) });
    },
    resetSidebar: () => {
      set({
        sidebarOrder: DEFAULT_SIDEBAR_ORDER,
        sidebarHiddenItems: [...DEFAULT_HIDDEN_SIDEBAR_ITEMS],
      });
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
      const clamped = Math.round(clamp(scale, UI_SCALE_MIN, UI_SCALE_MAX));
      applyUiScale(clamped);
      set({ uiScale: clamped });
    },
    resetUiScale: () => {
      applyUiScale(UI_SCALE_DEFAULT);
      set({ uiScale: UI_SCALE_DEFAULT });
    },
    setLibraryViewMode: mode => {
      set({ libraryViewMode: mode });
      useViewStore.setState({ selectedAlbumKey: null, albumGridScrollTop: 0 });
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
    partialize: s =>
      ({
        ...readPassthroughLegacyFields(),
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarHiddenItems: s.sidebarHiddenItems,
        sidebarOrder: s.sidebarOrder,
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
        nowPlayingPanel: s.nowPlayingPanel,
        libraryHeroCardEnabled: s.libraryHeroCardEnabled,
        lowPerformanceMode: s.lowPerformanceMode,
        noiseOverlayEnabled: s.noiseOverlayEnabled,
        tempoBreathingEnabled: s.tempoBreathingEnabled,
        artworkBloomEnabled: s.artworkBloomEnabled,
        coverCrossfadeEnabled: s.coverCrossfadeEnabled,
        vinylDisplayEnabled: s.vinylDisplayEnabled,
        vinylLabelSource: s.vinylLabelSource,
        vinylRingStyle: s.vinylRingStyle,
        roomLightEnabled: s.roomLightEnabled,
        roomLightIntensity: s.roomLightIntensity,
        roomLightStop: s.roomLightStop,
        roomLightHueShift: s.roomLightHueShift,
        landingView: s.landingView,
      }) as PersistedUIState,
    sanitize: (persisted, current) => ({
      ...current,
      ...sanitize(persisted as Partial<PersistedUIState>),
    }),
    onRehydrate: state => {
      applyUiScale(state.uiScale);
      applyLowPerformanceMode(state.lowPerformanceMode);
      // Land on the configured view. Rehydrate runs synchronously at module
      // load (localStorage), before the App tree reads `activeView`, so this
      // sets the home view without a visible flash. Only applied when the view
      // store is still at its own untouched default — never clobbers a view the
      // user has already navigated to in this session.
      const view = useViewStore.getState();
      if (view.activeView === 'library' && view.previousView === 'library') {
        useViewStore.setState({
          activeView: state.landingView,
          previousView: state.landingView,
        });
      }
    },
  }
);

acceptStoreHmr(useUIStore, import.meta.hot);
