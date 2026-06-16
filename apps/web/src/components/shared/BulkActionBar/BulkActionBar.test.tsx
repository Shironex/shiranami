import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import BulkActionBar from './BulkActionBar';

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

beforeEach(() => {
  seedLibrary([]);
  seedSelection([]);
});

afterEach(() => {
  seedLibrary([]);
  seedSelection([]);
});

describe('BulkActionBar', () => {
  it('renders nothing when there is no selection', () => {
    const { container } = render(<BulkActionBar trackList={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('renders the bulk dock with its core actions once tracks are selected', () => {
    const tracks = [makeTrack({ id: 'a' }), makeTrack({ id: 'b', title: 'Rainy day cafe' })];
    seedLibrary(tracks);
    seedSelection(['a', 'b']);

    render(<BulkActionBar trackList={tracks} />);

    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Queue' })).toBeInTheDocument();
  });
});
