import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useViewStore } from '@/stores/useViewStore';
import { albumKeyOf } from '@/lib/albumSort';

import AlbumDetailView from './AlbumDetailView';

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

function seedAlbum(tracks: Track[]): void {
  useLibraryStore.setState({ library: tracks });
  useViewStore.setState({ selectedAlbumKey: albumKeyOf(tracks[0]) });
}

function reset(): void {
  useLibraryStore.setState({ library: [] });
  usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  useSelectionStore.setState({ selectedTrackIds: new Set() });
  useViewStore.setState({ selectedAlbumKey: null });
}

beforeEach(reset);
afterEach(reset);

describe('AlbumDetailView', () => {
  it('renders nothing when no album is selected', () => {
    const { container } = render(<AlbumDetailView />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the album header and its tracks', () => {
    seedAlbum([
      makeTrack({ id: 'a1', title: 'Intro', trackNumber: 1 }),
      makeTrack({ id: 'a2', title: 'Drift', trackNumber: 2 }),
    ]);
    render(<AlbumDetailView />);

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('Drift')).toBeInTheDocument();
  });

  it('renders disc headings for a multi-disc album', () => {
    seedAlbum([
      makeTrack({ id: 'd1t1', title: 'Disc one opener', discNumber: 1, trackNumber: 1 }),
      makeTrack({ id: 'd2t1', title: 'Disc two opener', discNumber: 2, trackNumber: 1 }),
    ]);
    render(<AlbumDetailView />);

    expect(screen.getByText(/Disc 1/)).toBeInTheDocument();
    expect(screen.getByText(/Disc 2/)).toBeInTheDocument();
  });
});
