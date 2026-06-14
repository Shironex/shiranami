import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';

import FavoritesView from './FavoritesView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: true,
    ...overrides,
  };
}

function seedLibrary(tracks: Track[], libraryLoaded = true): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded });
}

function resetStores(): void {
  // Pre-hydration shape: empty library, not yet loaded.
  useLibraryStore.setState({ library: [], libraryLoaded: false });
  usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  // Keep the hero card off so the view under test stays focused on the list.
  useUIStore.setState({ libraryHeroCardEnabled: false });
  useSelectionStore.setState({ selectedTrackIds: new Set() });
  useTrackOverlayStore.getState().clearAll();
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  resetStores();
});

describe('FavoritesView', () => {
  it('shows the skeleton before the library loads', () => {
    render(<FavoritesView />);

    // The skeleton marks itself aria-busy and renders no page header.
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Your favorites')).toBeNull();
  });

  it('shows the empty state once loaded with no favorites', () => {
    seedLibrary([]);
    render(<FavoritesView />);

    expect(screen.getByText('No favorites yet')).toBeInTheDocument();
  });

  it('renders the page header and the favorited tracks', () => {
    seedLibrary([
      makeTrack({ id: 'a', title: 'Favorited track', isFavorite: true }),
      makeTrack({ id: 'b', title: 'Not favorited', isFavorite: false }),
    ]);
    render(<FavoritesView />);

    expect(screen.getByText('Your favorites')).toBeInTheDocument();
    expect(screen.getByText('Favorited track')).toBeInTheDocument();
    expect(screen.queryByText('Not favorited')).toBeNull();
  });
});
