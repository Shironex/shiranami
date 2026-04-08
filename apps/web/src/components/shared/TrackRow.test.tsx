import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Track } from '@/stores/usePlayerStore';
import { TrackRowContent } from './TrackRowContent';
import { TrackRow } from './TrackRow';

// ---- mocks ----

const selectionState = vi.hoisted(() => ({
  selectedTrackIds: new Set<string>(),
  lastClickedIndex: null as number | null,
  toggleTrack: vi.fn(),
  selectRange: vi.fn(),
  clearSelection: vi.fn(),
}));

vi.mock('@/stores/useSelectionStore', () => ({
  useSelectionStore: <T,>(selector: (s: typeof selectionState) => T) =>
    selector(selectionState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/shared/TrackContextMenu', () => ({
  TrackContextMenu: () => <div data-testid="context-menu" />,
}));

vi.mock('@/components/shared/AddToPlaylistButton', () => ({
  AddToPlaylistButton: ({ trackId }: { trackId: string }) => (
    <button data-testid={`add-to-playlist-${trackId}`}>Add</button>
  ),
}));

// ---- helpers ----

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    albumArt: 'https://example.com/art.jpg',
    isFavorite: false,
    ...overrides,
  };
}

function defaultProps(overrides: Partial<Parameters<typeof TrackRowContent>[0]> = {}) {
  const track = overrides.track ?? makeTrack();
  return {
    track,
    index: 0,
    queue: [track],
    currentTrack: null as Track | null,
    isPlaying: false,
    handlePlayTrack: vi.fn(),
    ...overrides,
  };
}

// ---- TrackRowContent ----

describe('TrackRowContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectionState.selectedTrackIds = new Set();
    selectionState.lastClickedIndex = null;
  });

  it('renders track title and artist', () => {
    render(<TrackRowContent {...defaultProps()} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('renders album art when provided', () => {
    render(<TrackRowContent {...defaultProps()} />);

    const img = screen.getByRole('img', { name: 'Test Song' });
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
  });

  it('renders play icon placeholder when no album art', () => {
    const track = makeTrack({ albumArt: undefined });
    const { container } = render(<TrackRowContent {...defaultProps({ track })} />);

    // No <img> should be present
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // Should render a Play SVG (lucide adds a class containing "lucide")
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders formatted duration for a valid duration', () => {
    // 215 seconds = 3:35
    render(<TrackRowContent {...defaultProps()} />);
    expect(screen.getByText('3:35')).toBeInTheDocument();
  });

  it('renders empty string for zero duration', () => {
    const track = makeTrack({ duration: 0 });
    render(<TrackRowContent {...defaultProps({ track })} />);
    expect(screen.queryByText('0:00')).not.toBeInTheDocument();
  });

  it('triggers play handler on click', async () => {
    const user = userEvent.setup();
    const handlePlayTrack = vi.fn();
    render(<TrackRowContent {...defaultProps({ handlePlayTrack })} />);

    const button = screen.getByRole('button', { name: /test song/i });
    await user.click(button);

    expect(handlePlayTrack).toHaveBeenCalledWith(0);
  });

  it('applies active styling when track is current track', () => {
    const track = makeTrack();
    const { container } = render(
      <TrackRowContent {...defaultProps({ track, currentTrack: track })} />,
    );

    const title = screen.getByText('Test Song');
    expect(title.className).toContain('text-primary');

    // The outer row div should have the active background class
    const row = container.querySelector('.bg-primary\\/\\[0\\.08\\]');
    expect(row).toBeInTheDocument();
  });

  it('shows now-playing EqBars when active and playing without album art', () => {
    const track = makeTrack({ albumArt: undefined });
    render(
      <TrackRowContent
        {...defaultProps({ track, currentTrack: track, isPlaying: true })}
      />,
    );

    expect(screen.getByText('nowPlaying')).toBeInTheDocument();
  });

  it('shows selected state when track is in selection', () => {
    selectionState.selectedTrackIds = new Set(['track-1']);
    const { container } = render(<TrackRowContent {...defaultProps()} />);

    const row = container.querySelector('.bg-primary\\/\\[0\\.12\\]');
    expect(row).toBeInTheDocument();
  });

  it('opens context menu on right-click', async () => {
    const user = userEvent.setup();
    render(<TrackRowContent {...defaultProps()} />);

    const row = screen.getByText('Test Song').closest('[class*="w-full flex"]')!;
    await user.pointer({ keys: '[MouseRight]', target: row });

    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  });

  it('renders with missing metadata gracefully', () => {
    const track = makeTrack({
      artist: 'Unknown Artist',
      albumArt: undefined,
      album: '',
    });
    render(<TrackRowContent {...defaultProps({ track })} />);

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
  });

  it('renders favorite button and fires callback', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    const track = makeTrack({ isFavorite: true });

    render(
      <TrackRowContent
        {...defaultProps({ track, onToggleFavorite })}
      />,
    );

    const favButton = screen.getByRole('button', { name: 'removeFromFavorites' });
    expect(favButton).toBeInTheDocument();

    await user.click(favButton);
    expect(onToggleFavorite).toHaveBeenCalledWith('track-1');
  });

  it('renders unfavorited state with correct aria label', () => {
    const track = makeTrack({ isFavorite: false });
    render(
      <TrackRowContent
        {...defaultProps({ track, onToggleFavorite: vi.fn() })}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'addToFavorites' }),
    ).toBeInTheDocument();
  });

  it('does not render favorite button when onToggleFavorite is not provided', () => {
    render(<TrackRowContent {...defaultProps()} />);

    expect(
      screen.queryByRole('button', { name: 'removeFromFavorites' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'addToFavorites' }),
    ).not.toBeInTheDocument();
  });

  it('renders remove-from-playlist button when callback provided', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <TrackRowContent
        {...defaultProps({ onRemoveFromPlaylist: onRemove })}
      />,
    );

    const btn = screen.getByRole('button', { name: 'removeFromPlaylist' });
    await user.click(btn);
    expect(onRemove).toHaveBeenCalledWith('track-1');
  });

  it('renders AddToPlaylistButton when showAddToPlaylist is true', () => {
    render(
      <TrackRowContent {...defaultProps({ showAddToPlaylist: true })} />,
    );

    expect(screen.getByTestId('add-to-playlist-track-1')).toBeInTheDocument();
  });

  it('ctrl+click toggles track selection', async () => {
    const user = userEvent.setup();
    render(<TrackRowContent {...defaultProps()} />);

    const button = screen.getByRole('button', { name: /test song/i });
    await user.keyboard('{Control>}');
    await user.click(button);
    await user.keyboard('{/Control}');

    expect(selectionState.toggleTrack).toHaveBeenCalledWith('track-1', 0);
  });

  it('shift+click selects range', async () => {
    const user = userEvent.setup();
    const track = makeTrack();
    const queue = [track, makeTrack({ id: 'track-2', title: 'Song 2' })];
    render(
      <TrackRowContent {...defaultProps({ track, queue })} />,
    );

    const button = screen.getByRole('button', { name: /test song/i });
    await user.keyboard('{Shift>}');
    await user.click(button);
    await user.keyboard('{/Shift}');

    expect(selectionState.selectRange).toHaveBeenCalledWith(0, queue);
  });

  it('click clears selection when tracks are selected', async () => {
    const user = userEvent.setup();
    selectionState.selectedTrackIds = new Set(['track-2']);
    render(<TrackRowContent {...defaultProps()} />);

    const button = screen.getByRole('button', { name: /test song/i });
    await user.click(button);

    expect(selectionState.clearSelection).toHaveBeenCalled();
  });
});

// ---- TrackRow (wrapper) ----

describe('TrackRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectionState.selectedTrackIds = new Set();
  });

  it('renders nothing when index is out of bounds', () => {
    const track = makeTrack();

    // react-window v2 spreads rowProps flat onto the component
    const { container } = render(
      <TrackRow
        index={5}
        style={{}}
        queue={[track]}
        currentTrack={null}
        isPlaying={false}
        handlePlayTrack={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders TrackRowContent for valid index', () => {
    const track = makeTrack();

    render(
      <TrackRow
        index={0}
        style={{}}
        queue={[track]}
        currentTrack={null}
        isPlaying={false}
        handlePlayTrack={vi.fn()}
      />,
    );
    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });
});
