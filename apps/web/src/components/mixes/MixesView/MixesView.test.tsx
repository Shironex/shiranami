import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';

import MixesView from './MixesView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    playCount: 0,
    ...overrides,
  };
}

function seedLibrary(tracks: Track[], libraryLoaded = true): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded });
}

function renderView(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  renderWithClient(client, <MixesView />);
}

function renderWithClient(client: QueryClient, ui: ReactElement): void {
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function resetStores(): void {
  // Pre-hydration shape: empty library, not yet loaded.
  useLibraryStore.setState({ library: [], libraryLoaded: false });
  usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  useSelectionStore.setState({ selectedTrackIds: new Set() });
  useTrackOverlayStore.getState().clearAll();
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  resetStores();
});

describe('MixesView', () => {
  it('shows the skeleton before the library loads', () => {
    renderView();

    // The skeleton marks itself aria-busy and renders no page header.
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Your mixes')).toBeNull();
  });

  it('shows the empty state once loaded with no tracks', () => {
    seedLibrary([]);
    renderView();

    expect(
      screen.getByText('Add tracks to your library to unlock smart mixes')
    ).toBeInTheDocument();
  });

  it('renders the page header and the curated mix grid once loaded', () => {
    seedLibrary([
      makeTrack({ id: 'a', title: 'Top track', playCount: 9 }),
      makeTrack({ id: 'b', title: 'Fresh track', playCount: 0 }),
    ]);
    renderView();

    expect(screen.getByText('Your mixes')).toBeInTheDocument();
    expect(screen.getByText('Most Played')).toBeInTheDocument();
    expect(screen.getByText('Never Played')).toBeInTheDocument();
  });
});
