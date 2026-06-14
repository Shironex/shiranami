import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { useLyricsView } from '@/hooks/useLyricsView';

const EMPTY_LYRICS_VIEW: ReturnType<typeof useLyricsView> = {
  synced: null,
  plain: null,
  activeLine: -1,
  isLoading: false,
  isError: false,
  handleLineClick: () => {},
};

const useLyricsViewMock = vi.fn(() => EMPTY_LYRICS_VIEW);

vi.mock('@/hooks/useLyricsView', () => ({
  useLyricsView: () => useLyricsViewMock(),
}));

import LyricsPanel from './LyricsPanel';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function setLyricsView(overrides: Partial<typeof EMPTY_LYRICS_VIEW> = {}): void {
  useLyricsViewMock.mockReturnValue({ ...EMPTY_LYRICS_VIEW, ...overrides });
}

beforeEach(() => {
  setLyricsView();
  usePlaybackStore.setState({ currentTrack: makeTrack() });
});

afterEach(() => {
  usePlaybackStore.setState({ currentTrack: null });
  // Restore the default empty view (not mockReset, which would leave the mock
  // returning undefined if a trailing passive effect re-runs the hook).
  useLyricsViewMock.mockReturnValue(EMPTY_LYRICS_VIEW);
});

describe('LyricsPanel', () => {
  it('renders nothing when no track is playing', () => {
    usePlaybackStore.setState({ currentTrack: null });
    const { container } = render(<LyricsPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the panel header title when a track is playing', () => {
    render(<LyricsPanel />);

    expect(screen.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();
  });

  it('renders the header action when provided', () => {
    render(<LyricsPanel headerAction={<button type="button">Flip</button>} />);

    expect(screen.getByRole('button', { name: 'Flip' })).toBeInTheDocument();
  });

  it('shows the loading label while lyrics are loading', () => {
    setLyricsView({ isLoading: true });
    render(<LyricsPanel />);

    expect(screen.getByText('Finding lyrics...')).toBeInTheDocument();
  });

  it('shows the empty label when no lyrics are found', () => {
    render(<LyricsPanel />);

    expect(screen.getByText('No lyrics found')).toBeInTheDocument();
  });

  it('renders synced lyric lines when present', () => {
    setLyricsView({
      synced: [
        { time: 0, text: 'Panel synced one' },
        { time: 5, text: 'Panel synced two' },
      ],
      activeLine: 0,
    });
    render(<LyricsPanel />);

    expect(screen.getByRole('button', { name: 'Panel synced one' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Panel synced two' })).toBeInTheDocument();
  });
});
