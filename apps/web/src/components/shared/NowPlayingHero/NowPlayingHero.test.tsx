import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import NowPlayingHero from './NowPlayingHero';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 184,
    filePath: '/music/midnight.mp3',
    ...overrides,
  } as Track;
}

beforeEach(() => {
  usePlaybackStore.setState({ currentTrack: null });
});

afterEach(() => {
  usePlaybackStore.setState({ currentTrack: null });
});

describe('NowPlayingHero', () => {
  it('renders the current track title and artist when something is playing', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    render(<NowPlayingHero />);

    expect(screen.getByRole('heading', { name: 'Midnight study session' })).toBeInTheDocument();
    expect(screen.getByText(/Lofi Collective/)).toBeInTheDocument();
  });

  it('renders nothing when nothing is playing', () => {
    const { container } = render(<NowPlayingHero />);

    expect(container).toBeEmptyDOMElement();
  });

  it('honors the show predicate — collapses when it returns false', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ title: 'Hidden track' }) });
    render(<NowPlayingHero show={() => false} />);

    expect(screen.queryByText('Hidden track')).toBeNull();
  });
});
