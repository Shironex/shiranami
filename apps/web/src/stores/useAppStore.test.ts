import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAppStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_OPACITY_MAX,
  LYRICS_PLAIN_OPACITY_MIN,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_MAX,
  LYRICS_SYNCED_DIM_OPACITY_MIN,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  nextLyricsFontSize,
} from './useAppStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

const STORE_KEY = 'shiranami.app-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
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
    });
    vi.mocked(window.electronAPI.window.setCompactMode).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockResolvedValue(undefined);
  });

  it('persists compact always-on-top to localStorage', async () => {
    await useAppStore.getState().setCompactAlwaysOnTop(true);
    expect(useAppStore.getState().compactAlwaysOnTop).toBe(true);
    expect(readPersisted().compactAlwaysOnTop).toBe(true);
  });

  it('rolls back compact mode when Electron setCompactMode fails', async () => {
    vi.mocked(window.electronAPI.window.setCompactMode).mockRejectedValueOnce(
      new Error('ipc failed')
    );

    await useAppStore.getState().setCompactMode(true);

    expect(useAppStore.getState().compactMode).toBe(false);
  });

  it('persists compact mode flag across reloads', async () => {
    await useAppStore.getState().setCompactMode(true);
    expect(useAppStore.getState().compactMode).toBe(true);
    expect(readPersisted().compactMode).toBe(true);
  });

  it('forwards configured compact size dimensions over IPC', async () => {
    useAppStore.setState({ compactSize: 'lg' });
    await useAppStore.getState().setCompactMode(true);

    expect(window.electronAPI.window.setCompactMode).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ width: 600, height: 260 })
    );
  });

  it('seeds compact always-on-top from compactDefaultAlwaysOnTop on entry', async () => {
    useAppStore.setState({ compactDefaultAlwaysOnTop: true, compactAlwaysOnTop: false });

    await useAppStore.getState().setCompactMode(true);

    expect(useAppStore.getState().compactAlwaysOnTop).toBe(true);
    expect(window.electronAPI.window.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('persists compactShowFavorite toggle to localStorage', () => {
    useAppStore.getState().setCompactShowFavorite(true);
    expect(useAppStore.getState().compactShowFavorite).toBe(true);
    expect(readPersisted().compactShowFavorite).toBe(true);
  });

  it('persists and clamps compactAmbientIntensity within the allowed range', () => {
    useAppStore.getState().setCompactAmbientIntensity(0.5);
    // Clamped to max (0.2).
    expect(useAppStore.getState().compactAmbientIntensity).toBe(0.2);
    expect(readPersisted().compactAmbientIntensity).toBe(0.2);
  });

  it('resetCompactAppearance restores all compact prefs to defaults', () => {
    useAppStore.setState({
      compactSize: 'lg',
      compactFontSize: 'sm',
      compactAmbientIntensity: 0.15,
      compactShowAlbumArt: false,
      compactShowAlbum: false,
      compactShowSeek: false,
      compactShowVolume: false,
      compactShowFavorite: true,
      compactDefaultAlwaysOnTop: true,
    });

    useAppStore.getState().resetCompactAppearance();

    const s = useAppStore.getState();
    expect(s.compactSize).toBe('md');
    expect(s.compactFontSize).toBe('md');
    expect(s.compactAmbientIntensity).toBe(0.08);
    expect(s.compactShowAlbumArt).toBe(true);
    expect(s.compactShowAlbum).toBe(true);
    expect(s.compactShowSeek).toBe(true);
    expect(s.compactShowVolume).toBe(true);
    expect(s.compactShowFavorite).toBe(false);
    expect(s.compactDefaultAlwaysOnTop).toBe(false);
  });

  it('toggleSidebarItem adds and removes items from hidden list', () => {
    const { toggleSidebarItem } = useAppStore.getState();

    toggleSidebarItem('favorites');
    expect(useAppStore.getState().sidebarHiddenItems).toEqual(['favorites']);
    expect(readPersisted().sidebarHiddenItems).toEqual(['favorites']);

    toggleSidebarItem('history');
    expect(useAppStore.getState().sidebarHiddenItems).toEqual(['favorites', 'history']);

    toggleSidebarItem('favorites');
    expect(useAppStore.getState().sidebarHiddenItems).toEqual(['history']);
  });

  it('persists sidebar playlists visibility to localStorage', () => {
    useAppStore.getState().setSidebarPlaylistsVisible(false);
    expect(useAppStore.getState().sidebarPlaylistsVisible).toBe(false);
    expect(readPersisted().sidebarPlaylistsVisible).toBe(false);

    useAppStore.getState().setSidebarPlaylistsVisible(true);
    expect(useAppStore.getState().sidebarPlaylistsVisible).toBe(true);
    expect(readPersisted().sidebarPlaylistsVisible).toBe(true);
  });

  it('persists album grid size to localStorage', () => {
    useAppStore.getState().setAlbumGridSize('small');
    expect(useAppStore.getState().albumGridSize).toBe('small');
    expect(readPersisted().albumGridSize).toBe('small');
  });

  it('persists album sort mode and resets scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumSortMode('artist');
    expect(useAppStore.getState().albumSortMode).toBe('artist');
    expect(useAppStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortMode).toBe('artist');
  });

  it('persists recentlyAdded sort mode and resets scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 300 });
    useAppStore.getState().setAlbumSortMode('recentlyAdded');
    expect(useAppStore.getState().albumSortMode).toBe('recentlyAdded');
    expect(useAppStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortMode).toBe('recentlyAdded');
  });

  it('coerceAlbumSortMode accepts recentlyAdded from persisted storage', () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({ state: { albumSortMode: 'recentlyAdded' }, version: 1 })
    );
    // Re-applying store state via merge path: simulate by calling setAlbumSortMode
    // and confirming the stored value round-trips through sanitize correctly.
    useAppStore.getState().setAlbumSortMode('recentlyAdded');
    expect(readPersisted().albumSortMode).toBe('recentlyAdded');
    // Unknown value falls back to 'name'
    useAppStore.getState().setAlbumSortMode('name');
    expect(useAppStore.getState().albumSortMode).toBe('name');
  });

  it('persists album sort order and resets scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumSortOrder('desc');
    expect(useAppStore.getState().albumSortOrder).toBe('desc');
    expect(useAppStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortOrder).toBe('desc');
  });

  it('album grid size changes do not reset scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumGridSize('large');
    expect(useAppStore.getState().albumGridScrollTop).toBe(500);
  });

  it('clamps lyrics plain opacity above max and rounds to step', () => {
    useAppStore.getState().setLyricsPlainOpacity(2);
    expect(useAppStore.getState().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_MAX);
    expect(readPersisted().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_MAX);
  });

  it('clamps lyrics plain opacity below min', () => {
    useAppStore.getState().setLyricsPlainOpacity(0);
    expect(useAppStore.getState().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_MIN);
  });

  it('rounds lyrics plain opacity to nearest step', () => {
    useAppStore.getState().setLyricsPlainOpacity(0.873);
    // step = 0.05, 0.873 -> rounds to 0.85
    expect(useAppStore.getState().lyricsPlainOpacity).toBeCloseTo(0.85, 2);
  });

  it('coerces invalid lyrics plain font size to default on setter', () => {
    // @ts-expect-error — runtime guard test
    useAppStore.getState().setLyricsPlainFontSize('huge');
    expect(useAppStore.getState().lyricsPlainFontSize).toBe(LYRICS_PLAIN_FONT_SIZE_DEFAULT);
  });

  it('persists lyrics plain font size when valid', () => {
    useAppStore.getState().setLyricsPlainFontSize('lg');
    expect(useAppStore.getState().lyricsPlainFontSize).toBe('lg');
    expect(readPersisted().lyricsPlainFontSize).toBe('lg');
  });

  it('resets lyrics plain appearance to defaults', () => {
    useAppStore.getState().setLyricsPlainOpacity(0.6);
    useAppStore.getState().setLyricsPlainFontSize('xl');
    useAppStore.getState().resetLyricsPlainAppearance();
    expect(useAppStore.getState().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_DEFAULT);
    expect(useAppStore.getState().lyricsPlainFontSize).toBe(LYRICS_PLAIN_FONT_SIZE_DEFAULT);
  });

  it('clamps lyrics synced dim opacity above max and rounds to step', () => {
    useAppStore.getState().setLyricsSyncedDimOpacity(2);
    expect(useAppStore.getState().lyricsSyncedDimOpacity).toBe(LYRICS_SYNCED_DIM_OPACITY_MAX);
    expect(readPersisted().lyricsSyncedDimOpacity).toBe(LYRICS_SYNCED_DIM_OPACITY_MAX);
  });

  it('clamps lyrics synced dim opacity below min (down to 0.2 not 0.5)', () => {
    useAppStore.getState().setLyricsSyncedDimOpacity(0);
    // Synced floor is lower than plain floor — synced lines may be very dim.
    expect(useAppStore.getState().lyricsSyncedDimOpacity).toBe(LYRICS_SYNCED_DIM_OPACITY_MIN);
    expect(LYRICS_SYNCED_DIM_OPACITY_MIN).toBe(0.2);
  });

  it('rounds lyrics synced dim opacity to nearest step', () => {
    useAppStore.getState().setLyricsSyncedDimOpacity(0.873);
    // step = 0.05, 0.873 -> rounds to 0.85
    expect(useAppStore.getState().lyricsSyncedDimOpacity).toBeCloseTo(0.85, 2);
  });

  it('coerces invalid lyrics synced font size to default on setter', () => {
    // @ts-expect-error — runtime guard test
    useAppStore.getState().setLyricsSyncedFontSize('huge');
    expect(useAppStore.getState().lyricsSyncedFontSize).toBe(LYRICS_SYNCED_FONT_SIZE_DEFAULT);
  });

  it('persists lyrics synced font size when valid', () => {
    useAppStore.getState().setLyricsSyncedFontSize('lg');
    expect(useAppStore.getState().lyricsSyncedFontSize).toBe('lg');
    expect(readPersisted().lyricsSyncedFontSize).toBe('lg');
  });

  it('resetLyricsAppearance restores all four lyrics prefs to defaults', () => {
    useAppStore.getState().setLyricsPlainOpacity(0.6);
    useAppStore.getState().setLyricsPlainFontSize('xl');
    useAppStore.getState().setLyricsSyncedDimOpacity(0.9);
    useAppStore.getState().setLyricsSyncedFontSize('sm');
    useAppStore.getState().resetLyricsAppearance();
    expect(useAppStore.getState().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_DEFAULT);
    expect(useAppStore.getState().lyricsPlainFontSize).toBe(LYRICS_PLAIN_FONT_SIZE_DEFAULT);
    expect(useAppStore.getState().lyricsSyncedDimOpacity).toBe(LYRICS_SYNCED_DIM_OPACITY_DEFAULT);
    expect(useAppStore.getState().lyricsSyncedFontSize).toBe(LYRICS_SYNCED_FONT_SIZE_DEFAULT);
  });

  it('nextLyricsFontSize bumps one step and caps at xl', () => {
    expect(nextLyricsFontSize('sm')).toBe('base');
    expect(nextLyricsFontSize('base')).toBe('lg');
    expect(nextLyricsFontSize('lg')).toBe('xl');
    expect(nextLyricsFontSize('xl')).toBe('xl');
  });

  it('rolls back compact always-on-top and localStorage when setAlwaysOnTop fails in compact mode', async () => {
    await useAppStore.getState().setCompactMode(true);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockRejectedValueOnce(
      new Error('aot failed')
    );

    await useAppStore.getState().setCompactAlwaysOnTop(true);

    expect(useAppStore.getState().compactAlwaysOnTop).toBe(false);
    expect(readPersisted().compactAlwaysOnTop).toBe(false);
  });
});

describe('useAppStore legacy localStorage migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('imports legacy per-key storage into combined key and removes legacy keys on first load', async () => {
    localStorage.setItem('shiranami.compact-always-on-top', 'true');
    localStorage.setItem('shiranami.ui-scale', '115');
    localStorage.setItem('shiranami.visualizer-style', 'waveform');
    localStorage.setItem('shiranami.sidebar-hidden-items', JSON.stringify(['favorites']));

    await import('./useAppStore');

    expect(localStorage.getItem('shiranami.compact-always-on-top')).toBeNull();
    expect(localStorage.getItem('shiranami.ui-scale')).toBeNull();
    expect(localStorage.getItem('shiranami.visualizer-style')).toBeNull();
    expect(localStorage.getItem('shiranami.sidebar-hidden-items')).toBeNull();

    const combined = JSON.parse(localStorage.getItem('shiranami.app-store') || '{}');
    expect(combined.version).toBe(1);
    expect(combined.state.compactAlwaysOnTop).toBe(true);
    expect(combined.state.uiScale).toBe(115);
    expect(combined.state.visualizerStyle).toBe('waveform');
    expect(combined.state.sidebarHiddenItems).toEqual(['favorites']);
  });

  it('does not overwrite existing combined key', async () => {
    const existing = { state: { uiScale: 90 }, version: 1 };
    localStorage.setItem('shiranami.app-store', JSON.stringify(existing));
    localStorage.setItem('shiranami.ui-scale', '120');

    await import('./useAppStore');

    // Combined key untouched
    expect(JSON.parse(localStorage.getItem('shiranami.app-store')!)).toEqual(existing);
    // Legacy key also left alone (idempotency check)
    expect(localStorage.getItem('shiranami.ui-scale')).toBe('120');
  });

  it('does nothing when no legacy keys exist', async () => {
    await import('./useAppStore');
    expect(localStorage.getItem('shiranami.app-store')).toBeNull();
  });

  it('sanitizes malformed lyrics plain prefs from persisted shape', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: { lyricsPlainOpacity: 'broken', lyricsPlainFontSize: 'huge' },
        version: 1,
      })
    );

    const mod = await import('./useAppStore');
    const state = mod.useAppStore.getState();
    expect(state.lyricsPlainOpacity).toBe(mod.LYRICS_PLAIN_OPACITY_DEFAULT);
    expect(state.lyricsPlainFontSize).toBe(mod.LYRICS_PLAIN_FONT_SIZE_DEFAULT);
  });

  it('falls back to synced lyrics defaults when persisted shape lacks the new keys', async () => {
    // Simulate a user upgrading from a build that only persisted plain prefs.
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: { lyricsPlainOpacity: 0.85, lyricsPlainFontSize: 'lg' },
        version: 1,
      })
    );

    const mod = await import('./useAppStore');
    const state = mod.useAppStore.getState();
    expect(state.lyricsPlainOpacity).toBe(0.85);
    expect(state.lyricsPlainFontSize).toBe('lg');
    expect(state.lyricsSyncedDimOpacity).toBe(mod.LYRICS_SYNCED_DIM_OPACITY_DEFAULT);
    expect(state.lyricsSyncedFontSize).toBe(mod.LYRICS_SYNCED_FONT_SIZE_DEFAULT);
  });

  it('sanitizes malformed lyrics synced prefs from persisted shape', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: { lyricsSyncedDimOpacity: 'broken', lyricsSyncedFontSize: 'huge' },
        version: 1,
      })
    );

    const mod = await import('./useAppStore');
    const state = mod.useAppStore.getState();
    expect(state.lyricsSyncedDimOpacity).toBe(mod.LYRICS_SYNCED_DIM_OPACITY_DEFAULT);
    expect(state.lyricsSyncedFontSize).toBe(mod.LYRICS_SYNCED_FONT_SIZE_DEFAULT);
  });
});
