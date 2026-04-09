import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

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
    expect(localStorage.getItem('shiranami.compact-always-on-top')).toBe('true');
  });

  it('rolls back compact mode when Electron setCompactMode fails', async () => {
    vi.mocked(window.electronAPI.window.setCompactMode).mockRejectedValueOnce(new Error('ipc failed'));

    await useAppStore.getState().setCompactMode(true);

    expect(useAppStore.getState().compactMode).toBe(false);
  });

  it('toggleSidebarItem adds and removes items from hidden list', () => {
    const { toggleSidebarItem } = useAppStore.getState();

    toggleSidebarItem('favorites');
    expect(useAppStore.getState().sidebarHiddenItems).toEqual(['favorites']);
    expect(JSON.parse(localStorage.getItem('shiranami.sidebar-hidden-items')!)).toEqual(['favorites']);

    toggleSidebarItem('history');
    expect(useAppStore.getState().sidebarHiddenItems).toEqual(['favorites', 'history']);

    toggleSidebarItem('favorites');
    expect(useAppStore.getState().sidebarHiddenItems).toEqual(['history']);
  });

  it('persists sidebar playlists visibility to localStorage', () => {
    useAppStore.getState().setSidebarPlaylistsVisible(false);
    expect(useAppStore.getState().sidebarPlaylistsVisible).toBe(false);
    expect(localStorage.getItem('shiranami.sidebar-playlists-visible')).toBe('false');

    useAppStore.getState().setSidebarPlaylistsVisible(true);
    expect(useAppStore.getState().sidebarPlaylistsVisible).toBe(true);
    expect(localStorage.getItem('shiranami.sidebar-playlists-visible')).toBe('true');
  });

  it('persists album grid size to localStorage', () => {
    useAppStore.getState().setAlbumGridSize('small');
    expect(useAppStore.getState().albumGridSize).toBe('small');
    expect(localStorage.getItem('shiranami.album-grid-size')).toBe('small');
  });

  it('persists album sort mode and resets scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumSortMode('artist');
    expect(useAppStore.getState().albumSortMode).toBe('artist');
    expect(useAppStore.getState().albumGridScrollTop).toBe(0);
    expect(localStorage.getItem('shiranami.album-sort-mode')).toBe('artist');
  });

  it('persists album sort order and resets scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumSortOrder('desc');
    expect(useAppStore.getState().albumSortOrder).toBe('desc');
    expect(useAppStore.getState().albumGridScrollTop).toBe(0);
    expect(localStorage.getItem('shiranami.album-sort-order')).toBe('desc');
  });

  it('album grid size changes do not reset scroll position', () => {
    useAppStore.setState({ albumGridScrollTop: 500 });
    useAppStore.getState().setAlbumGridSize('large');
    expect(useAppStore.getState().albumGridScrollTop).toBe(500);
  });

  it('rolls back compact always-on-top and localStorage when setAlwaysOnTop fails in compact mode', async () => {
    await useAppStore.getState().setCompactMode(true);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockRejectedValueOnce(new Error('aot failed'));

    await useAppStore.getState().setCompactAlwaysOnTop(true);

    expect(useAppStore.getState().compactAlwaysOnTop).toBe(false);
    expect(localStorage.getItem('shiranami.compact-always-on-top')).toBe('false');
  });
});
