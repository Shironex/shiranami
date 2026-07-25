import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import CompactFavoriteButton from './CompactFavoriteButton';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function renderButton() {
  return render(
    <TooltipProvider>
      <CompactFavoriteButton />
    </TooltipProvider>
  );
}

const realToggleFavorite = useLibraryStore.getState().toggleFavorite;

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null });
  useLibraryStore.setState({ library: [], toggleFavorite: realToggleFavorite });
  useTrackOverlayStore.getState().clearAll();
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('CompactFavoriteButton', () => {
  it('renders nothing while no track is playing', () => {
    const { container } = renderButton();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a radio stream, which cannot be favorited', () => {
    usePlaybackStore.setState({
      currentTrack: makeTrack({ filePath: 'shiranami-radio://lofi' }),
    });

    const { container } = renderButton();

    expect(container).toBeEmptyDOMElement();
  });

  it('offers to add a track that is not favorited', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    renderButton();

    const button = screen.getByRole('button', { name: 'Add to favorites' });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('svg')?.getAttribute('class')).not.toContain('fill-current');
  });

  it('offers to remove a favorited track and fills the heart', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ isFavorite: true }) });
    renderButton();

    const button = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('fill-current');
    expect(button.className).toContain('text-favorite');
  });

  it('toggles the current track when the heart is pressed', async () => {
    const user = userEvent.setup();
    const toggleFavorite = vi.fn();
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    useLibraryStore.setState({ toggleFavorite });
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));

    expect(toggleFavorite).toHaveBeenCalledWith('track-1');
  });

  it('prefers the mutation overlay over the playback track state', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ isFavorite: false }) });
    useTrackOverlayStore.getState().setOverlay('track-1', { isFavorite: true });

    renderButton();

    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  });

  it('plays the burst ring when the current track becomes freshly favorited', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ isFavorite: false }) });
    renderButton();

    const button = screen.getByRole('button', { name: 'Add to favorites' });
    expect(button.querySelector('span[aria-hidden="true"]')).toBeNull();

    act(() => {
      useTrackOverlayStore.getState().setOverlay('track-1', { isFavorite: true });
    });

    const favorited = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(favorited.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  it('does not celebrate when a skip lands on an already-favorited track', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ isFavorite: false }) });
    renderButton();

    act(() => {
      usePlaybackStore.setState({
        currentTrack: makeTrack({ id: 'track-2', isFavorite: true }),
      });
    });

    const button = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(button.querySelector('span[aria-hidden="true"]')).toBeNull();
  });
});
