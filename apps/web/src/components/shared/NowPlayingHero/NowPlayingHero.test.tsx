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

  it('positions the artwork wrapper so the frosted surface cannot paint over it', () => {
    usePlaybackStore.setState({
      currentTrack: makeTrack({ albumArt: 'file:///covers/late-nights.jpg' }),
    });
    render(<NowPlayingHero />);

    // The hero's two overlays (.now-playing-hero-surface and the blurred
    // backdrop) are absolutely positioned, so they outrank any in-flow
    // sibling in paint order. Without `relative` here the artwork renders
    // behind them once the entrance spring settles — dark and blurred.
    const artwork = screen.getByRole('img', { name: 'Midnight study session' });
    expect(artwork.parentElement?.className).toContain('relative');
  });

  it('honors the show predicate — collapses when it returns false', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ title: 'Hidden track' }) });
    render(<NowPlayingHero show={() => false} />);

    expect(screen.queryByText('Hidden track')).toBeNull();
  });
});
