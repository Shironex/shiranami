import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';

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
    vi.mocked(window.electronAPI.window.setCompactMode).mockRejectedValueOnce(new Error('ipc failed'));

    await useAppStore.getState().setCompactMode(true);

    expect(useAppStore.getState().compactMode).toBe(false);
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

  it('rolls back compact always-on-top and localStorage when setAlwaysOnTop fails in compact mode', async () => {
    await useAppStore.getState().setCompactMode(true);
    vi.mocked(window.electronAPI.window.setAlwaysOnTop).mockRejectedValueOnce(new Error('aot failed'));

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
});
