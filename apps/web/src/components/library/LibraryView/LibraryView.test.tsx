import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as renderBare, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { albumKeyOf } from '@/lib/albumSort';

import LibraryView from './LibraryView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function seedLibrary(tracks: Track[], libraryLoaded = true): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded });
}

// The view hook holds a (threshold-gated) FTS search query, so renders need a
// QueryClient even though these fixtures never cross the threshold.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderBare(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function resetStores(): void {
  useLibraryStore.setState({ library: [], libraryLoaded: false });
  usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  useUIStore.setState({ libraryViewMode: 'tracks', libraryHeroCardEnabled: false });
  useSelectionStore.setState({ selectedTrackIds: new Set() });
  useViewStore.setState({ selectedAlbumKey: null });
}

beforeEach(resetStores);
afterEach(resetStores);

describe('LibraryView', () => {
  it('shows the skeleton before the library loads', () => {
    render(<LibraryView />);

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Your library')).toBeNull();
  });

  it('shows the empty state once loaded with no tracks', () => {
    seedLibrary([]);
    render(<LibraryView />);

    expect(screen.getByText('No tracks yet')).toBeInTheDocument();
  });

  it('renders the page header and the search input once tracks exist', () => {
    seedLibrary([makeTrack({ id: 'a', title: 'Intro' })]);
    render(<LibraryView />);

    expect(screen.getByText('Your library')).toBeInTheDocument();
    expect(screen.getByTestId('library-search-input')).toBeInTheDocument();
  });

  it('filters client-side below the FTS threshold, without touching the bridge', async () => {
    const search = vi.mocked(window.electronAPI.db.tracks.search);
    search.mockClear();
    seedLibrary([
      makeTrack({ id: 'a', title: 'Sakura Rain', filePath: '/music/a.mp3' }),
      makeTrack({ id: 'b', title: 'Night Drive', filePath: '/music/b.mp3' }),
    ]);
    render(<LibraryView />);

    fireEvent.change(screen.getByTestId('library-search-input'), {
      target: { value: 'sakura' },
    });

    expect(await screen.findByText('1 of 2 tracks')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('routes search through the FTS index once the library crosses the threshold', async () => {
    const search = vi.mocked(window.electronAPI.db.tracks.search);
    search.mockClear();
    seedLibrary(
      Array.from({ length: 2001 }, (_, index) =>
        makeTrack({ id: `t${index}`, title: `Track ${index}`, filePath: `/music/${index}.mp3` })
      )
    );
    render(<LibraryView />);

    fireEvent.change(screen.getByTestId('library-search-input'), {
      target: { value: 'sakura' },
    });

    // The query is debounced, so the call lands after the settle window.
    await waitFor(() => expect(search).toHaveBeenCalledWith('sakura', 1000));
  });

  it('renders the album detail view when an album is selected in albums mode', () => {
    const track = makeTrack({ id: 'a', title: 'Intro', album: 'Midnight Tapes' });
    seedLibrary([track]);
    useUIStore.setState({ libraryViewMode: 'albums' });
    useViewStore.setState({ selectedAlbumKey: albumKeyOf(track) });
    render(<LibraryView />);

    // The detail view renders the album title + a back affordance.
    expect(screen.getByRole('button', { name: 'Back to albums' })).toBeInTheDocument();
  });
});
