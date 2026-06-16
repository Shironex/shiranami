import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import TrackContextMenu from './TrackContextMenu';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 120,
    filePath: '/music/lofi.mp3',
    isFavorite: false,
    ...overrides,
  } as Track;
}

function seedLibrary(tracks: Track[]): void {
  useLibraryStore.setState({ library: tracks });
}

function seedSelection(ids: string[]): void {
  useSelectionStore.setState({ selectedTrackIds: new Set(ids), lastClickedIndex: null });
}

function renderMenu(track: Track): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TrackContextMenu track={track} position={{ x: 10, y: 10 }} onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  seedLibrary([]);
  seedSelection([]);
});

afterEach(() => {
  seedLibrary([]);
  seedSelection([]);
});

describe('TrackContextMenu', () => {
  it('renders the core single-track actions', () => {
    const track = makeTrack();
    seedLibrary([track]);
    renderMenu(track);

    expect(screen.getByRole('button', { name: 'Play Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from Library' })).toBeInTheDocument();
  });

  it('shows the bulk header when the track is part of a multi-selection', () => {
    const tracks = [makeTrack(), makeTrack({ id: 'track-2', title: 'Rainy day cafe' })];
    seedLibrary(tracks);
    seedSelection(tracks.map(t => t.id));
    renderMenu(tracks[0]);

    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });
});
