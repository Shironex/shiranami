import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { useViewStore } from '@/stores/useViewStore';

import AlbumGrid from './AlbumGrid';

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

const library: Track[] = [
  makeTrack({ id: 'a1', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'b1', album: 'Rainy Day', artist: 'Aso' }),
];

function reset(): void {
  useViewStore.setState({ selectedAlbumKey: null, albumGridScrollTop: 0 });
}

beforeEach(reset);
afterEach(reset);

describe('AlbumGrid', () => {
  it('renders the no-matches empty state when the filter excludes every album', () => {
    render(<AlbumGrid library={library} searchQuery="zzz-no-such-album" />);

    expect(screen.getByText('No matching tracks')).toBeInTheDocument();
  });

  it('shows the album filter-count line while filtering', () => {
    render(<AlbumGrid library={library} searchQuery="rainy" />);

    // "1 of 2 albums" — one album matches "rainy", out of two total.
    expect(screen.getByText('1 of 2 albums')).toBeInTheDocument();
  });

  it('does not show the filter-count line with no active query', () => {
    render(<AlbumGrid library={library} searchQuery="" />);

    expect(screen.queryByText(/of 2 albums/)).toBeNull();
  });
});
