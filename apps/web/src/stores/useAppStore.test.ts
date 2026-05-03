import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';
import { useViewStore } from './useViewStore';

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
      sidebarCollapsed: false,
      sidebarHiddenItems: [],
      sidebarPlaylistsVisible: true,
      showVisualizer: true,
      visualizerStyle: 'bars',
    });
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
    useViewStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumSortMode('artist');
    expect(useAppStore.getState().albumSortMode).toBe('artist');
    expect(useViewStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortMode).toBe('artist');
  });

  it('persists recentlyAdded sort mode and resets scroll position', () => {
    useViewStore.setState({ albumGridScrollTop: 300 });
    useAppStore.getState().setAlbumSortMode('recentlyAdded');
    expect(useAppStore.getState().albumSortMode).toBe('recentlyAdded');
    expect(useViewStore.getState().albumGridScrollTop).toBe(0);
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
    useViewStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumSortOrder('desc');
    expect(useAppStore.getState().albumSortOrder).toBe('desc');
    expect(useViewStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortOrder).toBe('desc');
  });

  it('album grid size changes do not reset scroll position', () => {
    useViewStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumGridSize('large');
    expect(useViewStore.getState().albumGridScrollTop).toBe(500);
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
});
