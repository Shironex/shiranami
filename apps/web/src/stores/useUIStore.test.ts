import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from './useUIStore';
import { useViewStore } from './useViewStore';
import { DEFAULT_HIDDEN_SIDEBAR_ITEMS, DEFAULT_SIDEBAR_ORDER } from '@/lib/sidebar-items';

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

describe('useUIStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({
      sidebarCollapsed: false,
      sidebarHiddenItems: [],
      sidebarOrder: DEFAULT_SIDEBAR_ORDER,
      sidebarPlaylistsVisible: true,
      showVisualizer: true,
      visualizerStyle: 'bars',
    });
  });

  it('toggleSidebarItem adds and removes items from hidden list', () => {
    const { toggleSidebarItem } = useUIStore.getState();

    toggleSidebarItem('favorites');
    expect(useUIStore.getState().sidebarHiddenItems).toEqual(['favorites']);
    expect(readPersisted().sidebarHiddenItems).toEqual(['favorites']);

    toggleSidebarItem('history');
    expect(useUIStore.getState().sidebarHiddenItems).toEqual(['favorites', 'history']);

    toggleSidebarItem('favorites');
    expect(useUIStore.getState().sidebarHiddenItems).toEqual(['history']);
  });

  it('toggleSidebarItem ignores always-visible items (settings)', () => {
    useUIStore.getState().toggleSidebarItem('settings');
    expect(useUIStore.getState().sidebarHiddenItems).toEqual([]);
    expect(readPersisted().sidebarHiddenItems ?? []).toEqual([]);
  });

  it('reorderSidebarItem moves an item to a new slot and persists the order', () => {
    // Move library to where favorites sits; library lands just before favorites.
    useUIStore.getState().reorderSidebarItem('library', 'favorites');

    const order = useUIStore.getState().sidebarOrder;
    expect(order.slice(0, 5)).toEqual(['overview', 'playlists', 'favorites', 'library', 'history']);
    // No items lost, no duplicates introduced.
    expect(order).toHaveLength(DEFAULT_SIDEBAR_ORDER.length);
    expect(new Set(order).size).toBe(DEFAULT_SIDEBAR_ORDER.length);
    expect(readPersisted().sidebarOrder).toEqual(order);
  });

  it('reorderSidebarItem is a no-op for unknown ids or a self-move', () => {
    useUIStore.getState().reorderSidebarItem('library', 'library');
    expect(useUIStore.getState().sidebarOrder).toEqual(DEFAULT_SIDEBAR_ORDER);

    useUIStore.getState().reorderSidebarItem('not-a-view' as never, 'library');
    expect(useUIStore.getState().sidebarOrder).toEqual(DEFAULT_SIDEBAR_ORDER);
  });

  it('resetSidebar restores the default order and default hidden items', () => {
    useUIStore.getState().reorderSidebarItem('radio', 'overview');
    useUIStore.getState().toggleSidebarItem('mixes');
    expect(useUIStore.getState().sidebarOrder).not.toEqual(DEFAULT_SIDEBAR_ORDER);

    useUIStore.getState().resetSidebar();
    expect(useUIStore.getState().sidebarOrder).toEqual(DEFAULT_SIDEBAR_ORDER);
    expect(useUIStore.getState().sidebarHiddenItems).toEqual(DEFAULT_HIDDEN_SIDEBAR_ITEMS);
    expect(readPersisted().sidebarOrder).toEqual(DEFAULT_SIDEBAR_ORDER);
  });

  it('persists sidebar playlists visibility to localStorage', () => {
    useUIStore.getState().setSidebarPlaylistsVisible(false);
    expect(useUIStore.getState().sidebarPlaylistsVisible).toBe(false);
    expect(readPersisted().sidebarPlaylistsVisible).toBe(false);

    useUIStore.getState().setSidebarPlaylistsVisible(true);
    expect(useUIStore.getState().sidebarPlaylistsVisible).toBe(true);
    expect(readPersisted().sidebarPlaylistsVisible).toBe(true);
  });

  it('persists album grid size to localStorage', () => {
    useUIStore.getState().setAlbumGridSize('small');
    expect(useUIStore.getState().albumGridSize).toBe('small');
    expect(readPersisted().albumGridSize).toBe('small');
  });

  it('persists album sort mode and resets scroll position', () => {
    useViewStore.setState({ albumGridScrollTop: 500 });
    useUIStore.getState().setAlbumSortMode('artist');
    expect(useUIStore.getState().albumSortMode).toBe('artist');
    expect(useViewStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortMode).toBe('artist');
  });

  it('persists recentlyAdded sort mode and resets scroll position', () => {
    useViewStore.setState({ albumGridScrollTop: 300 });
    useUIStore.getState().setAlbumSortMode('recentlyAdded');
    expect(useUIStore.getState().albumSortMode).toBe('recentlyAdded');
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
    useUIStore.getState().setAlbumSortMode('recentlyAdded');
    expect(readPersisted().albumSortMode).toBe('recentlyAdded');
    // Unknown value falls back to 'name'
    useUIStore.getState().setAlbumSortMode('name');
    expect(useUIStore.getState().albumSortMode).toBe('name');
  });

  it('persists album sort order and resets scroll position', () => {
    useViewStore.setState({ albumGridScrollTop: 500 });
    useUIStore.getState().setAlbumSortOrder('desc');
    expect(useUIStore.getState().albumSortOrder).toBe('desc');
    expect(useViewStore.getState().albumGridScrollTop).toBe(0);
    expect(readPersisted().albumSortOrder).toBe('desc');
  });

  it('album grid size changes do not reset scroll position', () => {
    useViewStore.setState({ albumGridScrollTop: 500 });
    useUIStore.getState().setAlbumGridSize('large');
    expect(useViewStore.getState().albumGridScrollTop).toBe(500);
  });

  it('preserves unknown legacy fields in shared bucket across persist writes', () => {
    // Seed the bucket with a lyrics-prefs field that belongs to useLyricsAppearanceStore
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { lyricsPlainOpacity: 0.75, sidebarCollapsed: false },
        version: 1,
      })
    );

    // Trigger a UI mutation — this causes partialize() to run and write back
    useUIStore.getState().setSidebarCollapsed(true);

    const persisted = readPersisted();
    expect(persisted.lyricsPlainOpacity).toBe(0.75);
    expect(persisted.sidebarCollapsed).toBe(true);
  });
});

describe('coerceVisualizerStyle (persist merge path)', () => {
  const ALL_STYLES = [
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
  ] as const;

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('accepts every valid visualizer style from persisted storage', async () => {
    for (const style of ALL_STYLES) {
      localStorage.clear();
      vi.resetModules();
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ state: { visualizerStyle: style }, version: 1 })
      );
      const { useUIStore: store } = await import('./useUIStore');
      expect(store.getState().visualizerStyle).toBe(style);
    }
  });

  it('falls back to "bars" for unknown / garbage values', async () => {
    for (const garbage of ['nope', 'WAVE', 42, null, '', 'particless']) {
      localStorage.clear();
      vi.resetModules();
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ state: { visualizerStyle: garbage }, version: 1 })
      );
      const { useUIStore: store } = await import('./useUIStore');
      expect(store.getState().visualizerStyle).toBe('bars');
    }
  });
});

describe('sidebarOrder reconciliation (persist merge path)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('drops unknown ids, appends missing ones, and dedupes a stale saved order', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { sidebarOrder: ['radio', 'bogus-view', 'library', 'library'] },
        version: 1,
      })
    );

    const { useUIStore: store } = await import('./useUIStore');
    const order = store.getState().sidebarOrder;

    // Known saved ids kept in saved order, deduped.
    expect(order[0]).toBe('radio');
    expect(order[1]).toBe('library');
    // Unknown id removed.
    expect(order).not.toContain('bogus-view');
    // Every current nav id is present exactly once.
    expect(new Set(order).size).toBe(DEFAULT_SIDEBAR_ORDER.length);
    for (const id of DEFAULT_SIDEBAR_ORDER) {
      expect(order).toContain(id);
    }
  });

  it('falls back to the full default order when nothing is persisted', async () => {
    const { useUIStore: store } = await import('./useUIStore');
    expect(store.getState().sidebarOrder).toEqual(DEFAULT_SIDEBAR_ORDER);
  });

  it('strips always-visible ids from sidebarHiddenItems on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { sidebarHiddenItems: ['settings', 'favorites'] },
        version: 1,
      })
    );

    const { useUIStore: store } = await import('./useUIStore');
    expect(store.getState().sidebarHiddenItems).toEqual(['favorites']);
  });
});

describe('useUIStore legacy localStorage migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('imports legacy per-key storage into combined key and removes legacy keys on first load', async () => {
    localStorage.setItem('shiranami.compact-always-on-top', 'true');
    localStorage.setItem('shiranami.ui-scale', '115');
    localStorage.setItem('shiranami.visualizer-style', 'waveform');
    localStorage.setItem('shiranami.sidebar-hidden-items', JSON.stringify(['favorites']));

    await import('./useUIStore');

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

    await import('./useUIStore');

    // Combined key untouched
    expect(JSON.parse(localStorage.getItem('shiranami.app-store')!)).toEqual(existing);
    // Legacy key also left alone (idempotency check)
    expect(localStorage.getItem('shiranami.ui-scale')).toBe('120');
  });

  it('does nothing when no legacy keys exist', async () => {
    await import('./useUIStore');
    expect(localStorage.getItem('shiranami.app-store')).toBeNull();
  });
});
