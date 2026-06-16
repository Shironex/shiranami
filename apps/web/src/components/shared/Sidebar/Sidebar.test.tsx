import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Sidebar from './Sidebar';
import type { AppView } from '@/stores/useViewStore';

// ── Shared spies ──

const navigateTo = vi.fn();
const toggleSidebarCollapsed = vi.fn();

// ── Default store state ──

let storeState: Record<string, unknown> = {};

function setStoreState(overrides: Record<string, unknown>) {
  storeState = {
    activeView: 'library' as AppView,
    selectedPlaylistId: null,
    sidebarCollapsed: false,
    sidebarHiddenItems: [] as AppView[],
    sidebarPlaylistsVisible: true,
    landingView: 'overview' as AppView,
    navigateTo,
    toggleSidebarCollapsed,
    ...overrides,
  };
}

// ── Mocks ──

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: <T,>(selector: (s: Record<string, unknown>) => T) => selector(storeState),
}));

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: <T,>(selector: (s: Record<string, unknown>) => T) => selector(storeState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { ns?: string }) => (opts?.ns === 'common' ? key : key),
  }),
}));

vi.mock('@/hooks/useAppVersion', () => ({
  useAppVersion: () => '1.0.0',
}));

vi.mock('@/lib/platform', () => ({
  IS_MAC: false,
}));

let playlistQueryResult = {
  data: [] as Array<{ id: string; name: string; coverArt?: string }>,
  isLoading: false,
};

vi.mock('@/hooks/queries/usePlaylists', () => ({
  usePlaylistsQuery: () => playlistQueryResult,
}));

vi.mock('@/components/shared/PlaylistContextMenu', () => ({
  PlaylistContextMenu: () => null,
}));

// framer-motion's layoutId triggers warnings in jsdom; provide a passthrough
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop === 'string') {
          const MotionMock = ({
            children,
            className,
          }: React.HTMLAttributes<HTMLElement> & { layoutId?: string; transition?: unknown }) => {
            const Element = prop as keyof React.JSX.IntrinsicElements;
            return <Element className={className}>{children}</Element>;
          };
          MotionMock.displayName = `motion.${prop}`;
          return MotionMock;
        }
        return undefined;
      },
    }
  ),
}));

// ── Helpers ──

const ALL_NAV_KEYS = [
  'overview',
  'library',
  'playlists',
  'favorites',
  'history',
  'mixes',
  'search',
  'importPlaylist',
  'radio',
  'settings',
] as const;

const NAV_VIEW_IDS: AppView[] = [
  'overview',
  'library',
  'playlists',
  'favorites',
  'history',
  'mixes',
  'search',
  'import-playlist',
  'radio',
  'settings',
];

// ── Tests ──

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playlistQueryResult = { data: [], isLoading: false };
    setStoreState({});
  });

  // 1. Renders all navigation items
  it('renders all navigation items when none are hidden', () => {
    render(<Sidebar />);

    for (const key of ALL_NAV_KEYS) {
      expect(screen.getByRole('button', { name: key })).toBeInTheDocument();
    }
  });

  // 2. Active view is visually highlighted
  it('applies active styling to the current active view', () => {
    setStoreState({ activeView: 'favorites' });
    render(<Sidebar />);

    const favoritesBtn = screen.getByRole('button', { name: 'favorites' });
    // The active item gets 'text-foreground' class (no 'text-muted-foreground')
    expect(favoritesBtn.className).toContain('text-foreground');
    expect(favoritesBtn.className).not.toContain('text-muted-foreground');

    // A non-active item should have muted styling
    const historyBtn = screen.getByRole('button', { name: 'history' });
    expect(historyBtn.className).toContain('text-muted-foreground');
  });

  // 3. Click on a nav item calls navigateTo with the correct view ID
  it('calls navigateTo with the correct view ID when a nav item is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    for (let i = 0; i < ALL_NAV_KEYS.length; i++) {
      await user.click(screen.getByRole('button', { name: ALL_NAV_KEYS[i] }));
      expect(navigateTo).toHaveBeenCalledWith(NAV_VIEW_IDS[i]);
    }

    expect(navigateTo).toHaveBeenCalledTimes(ALL_NAV_KEYS.length);
  });

  // 4a. Collapsed state: shows title attributes on nav buttons
  it('shows title attributes on nav buttons when sidebar is collapsed', () => {
    setStoreState({ sidebarCollapsed: true });
    render(<Sidebar />);

    for (const key of ALL_NAV_KEYS) {
      const btn = screen.getByRole('button', { name: key });
      expect(btn).toHaveAttribute('title', key);
    }
  });

  // 4b. Expanded state: shows text labels for nav items
  it('shows text labels for nav items when sidebar is expanded', () => {
    setStoreState({ sidebarCollapsed: false });
    render(<Sidebar />);

    for (const key of ALL_NAV_KEYS) {
      const btn = screen.getByRole('button', { name: key });
      expect(btn.textContent).toContain(key);
    }
  });

  // 4c. Collapsed sidebar uses narrow width
  it('uses narrow width class when collapsed', () => {
    setStoreState({ sidebarCollapsed: true });
    const { container } = render(<Sidebar />);

    const sidebarDiv = container.firstElementChild as HTMLElement;
    expect(sidebarDiv.className).toContain('w-[5.25rem]');
    expect(sidebarDiv.style.width).toBe('');
  });

  // 4d. Expanded sidebar uses the persisted resizable width (inline style)
  it('uses the persisted resizable width when expanded', () => {
    setStoreState({ sidebarCollapsed: false });
    const { container } = render(<Sidebar />);

    const sidebarDiv = container.firstElementChild as HTMLElement;
    expect(sidebarDiv.style.width).toBe('200px');
    expect(sidebarDiv.className).not.toContain('w-[5.25rem]');
  });

  // 5. Toggle collapse button calls toggleSidebarCollapsed
  it('calls toggleSidebarCollapsed when the collapse toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'collapseSidebar' }));
    expect(toggleSidebarCollapsed).toHaveBeenCalledTimes(1);
  });

  it('shows expand label when sidebar is collapsed', () => {
    setStoreState({ sidebarCollapsed: true });
    render(<Sidebar />);

    expect(screen.getByRole('button', { name: 'expandSidebar' })).toBeInTheDocument();
  });

  // 6. Settings nav item navigates to settings view
  it('navigates to settings view when settings is clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'settings' }));
    expect(navigateTo).toHaveBeenCalledWith('settings');
  });

  // 7. Playlists section renders playlist list when expanded
  it('shows playlist list in expanded sidebar when playlists exist', () => {
    playlistQueryResult = {
      data: [
        { id: 'pl-1', name: 'My Chill Mix' },
        { id: 'pl-2', name: 'Workout Bangers' },
      ],
      isLoading: false,
    };
    setStoreState({ sidebarCollapsed: false, sidebarPlaylistsVisible: true });
    render(<Sidebar />);

    expect(screen.getByText('My Chill Mix')).toBeInTheDocument();
    expect(screen.getByText('Workout Bangers')).toBeInTheDocument();
  });

  // 8. Playlists section is hidden when sidebarPlaylistsVisible is false
  it('does not show playlist section when sidebarPlaylistsVisible is false', () => {
    playlistQueryResult = {
      data: [{ id: 'pl-1', name: 'Hidden Playlist' }],
      isLoading: false,
    };
    setStoreState({ sidebarCollapsed: false, sidebarPlaylistsVisible: false });
    render(<Sidebar />);

    expect(screen.queryByText('Hidden Playlist')).not.toBeInTheDocument();
  });

  // 9. Hidden nav items are filtered out
  it('does not render nav items that are in sidebarHiddenItems', () => {
    setStoreState({ sidebarHiddenItems: ['radio', 'mixes'] });
    render(<Sidebar />);

    expect(screen.queryByRole('button', { name: 'radio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'mixes' })).not.toBeInTheDocument();
    // Others should still be present
    expect(screen.getByRole('button', { name: 'library' })).toBeInTheDocument();
  });

  // 9b. Always-visible items are never hidden even when in sidebarHiddenItems
  it('always renders always-visible items even when they are in sidebarHiddenItems', () => {
    setStoreState({ sidebarHiddenItems: ['settings', 'radio'] });
    render(<Sidebar />);

    expect(screen.getByRole('button', { name: 'settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'radio' })).not.toBeInTheDocument();
  });

  // 10. Clicking a playlist navigates to playlists view with playlist ID
  it('navigates to playlists view with playlist ID when a playlist is clicked', async () => {
    const user = userEvent.setup();
    playlistQueryResult = {
      data: [{ id: 'pl-42', name: 'Lo-fi Beats' }],
      isLoading: false,
    };
    setStoreState({ sidebarCollapsed: false, sidebarPlaylistsVisible: true });
    render(<Sidebar />);

    await user.click(screen.getByText('Lo-fi Beats'));
    expect(navigateTo).toHaveBeenCalledWith('playlists', 'pl-42');
  });

  // 11. Logo/mascot button navigates to the configured landing view
  it('navigates to the landing view when the logo button is clicked', async () => {
    const user = userEvent.setup();
    setStoreState({ landingView: 'overview' as AppView });
    render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'openHome' }));
    expect(navigateTo).toHaveBeenCalledWith('overview');
  });

  it('navigates to library from the logo when library is the landing view', async () => {
    const user = userEvent.setup();
    setStoreState({ landingView: 'library' as AppView });
    render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: 'openHome' }));
    expect(navigateTo).toHaveBeenCalledWith('library');
  });

  // 12. Version label is displayed
  it('displays version label at the bottom', () => {
    setStoreState({ sidebarCollapsed: false });
    render(<Sidebar />);

    expect(screen.getByText(/shiranami v1\.0\.0/)).toBeInTheDocument();
  });

  it('displays only version when sidebar is collapsed', () => {
    setStoreState({ sidebarCollapsed: true });
    render(<Sidebar />);

    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  // 13. Loading state for playlists
  it('shows loading indicator when playlists are loading', () => {
    playlistQueryResult = { data: [], isLoading: true };
    setStoreState({ sidebarCollapsed: false, sidebarPlaylistsVisible: true });
    const { container } = render(<Sidebar />);

    // Loader2 renders with animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  // 14. Collapsed sidebar shows playlist thumbnails instead of names
  it('shows playlist thumbnails in collapsed mode', () => {
    playlistQueryResult = {
      data: [{ id: 'pl-1', name: 'My Playlist' }],
      isLoading: false,
    };
    setStoreState({ sidebarCollapsed: true, sidebarPlaylistsVisible: true });
    render(<Sidebar />);

    // In collapsed mode, playlist name appears as aria-label/title, not as text content
    const playlistBtn = screen.getByRole('button', { name: 'My Playlist' });
    expect(playlistBtn).toBeInTheDocument();
    // Should not have visible text label for playlist name in collapsed mode
    expect(playlistBtn.querySelector('p')).toBeNull();
  });
});
